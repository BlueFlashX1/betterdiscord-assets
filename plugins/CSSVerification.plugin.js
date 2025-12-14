/**
 * @name CSS Verification Tool
 * @author BlueFlashX1
 * @description Verifies custom CSS variables and selectors - shows what matches, what doesn't, and where it comes from
 * @version 1.1.0
 * @authorId
 */

module.exports = (() => {
  const config = {
    info: {
      name: 'CSS Verification Tool',
      authors: [
        {
          name: 'BlueFlashX1',
          discord_id: '',
        },
      ],
      version: '1.1.0',
      description:
        "Verifies custom CSS variables and selectors - shows what matches, what doesn't, and where it comes from",
    },
  };

  return !window.ZeresPluginLibrary
    ? class {
        getName() {
          return config.info.name;
        }
        getAuthor() {
          return config.info.authors.map((a) => a.name).join(', ');
        }
        getDescription() {
          return config.info.description;
        }
        getVersion() {
          return config.info.version;
        }
        load() {
          BdApi.showConfirmationModal(
            'Library Missing',
            `The library plugin needed for ${config.info.name} is missing. For safety, this plugin does not auto-download code. Click Open Download Page and install ZeresPluginLibrary manually.`,
            {
              confirmText: 'Open Download Page',
              cancelText: 'Cancel',
              onConfirm: () => {
                require('electron').shell.openExternal(
                  'https://betterdiscord.app/plugin/ZeresPluginLibrary'
                );
              },
            }
          );
        }
        start() {}
        stop() {}
      }
    : (([Plugin, Api]) => {
        const plugin = (Plugin, Library) => {
          // Library available

          return class CSSVerification extends Plugin {
            constructor() {
              super();
              this.cssVariables = new Map(); // name -> {name, value, defined, definitions: []}
              this.usedVariables = new Map(); // name -> [{sourceId, selector, property, value}]
              this.testResults = new Map(); // name -> computed + classification
              this.selectorResults = []; // [{sourceId, selector, status, matchCount, context}]
              this.sourceIndex = new Map(); // sourceId -> {sourceId, label, href, ownerType, accessible}
              this.highlightStateByElement = new WeakMap(); // Element -> {prevOutline, prevOutlineOffset, prevBoxShadow, timer}
              this._highlightTimeouts = new Set();
              this._highlightedElements = new Set();
              this._panelDragHandlers = null;
              this.selectorScanMode = 'capped'; // 'capped' | 'full'
              this.selectorScanCaps = { capped: 1500, full: 20000 };
              this.remainingSelectorChecks = 0;
              this.focusedSelectors = [
                'div[role="tablist"]',
                'div[role="tablist"][class*="tabBar__"]',
                'div[aria-label="Friends"] div[class*="tabBar__"]',
                'div[aria-label="Friends"] div[class*="children__"]',
                'div[aria-label="Friends"] div[class*="upperContainer__"]',
              ];
              this.focusedSelectorResults = []; // {selector, matchCount, matches, error}
            }

            onStart() {
              this.analyzeCSS();
              this.injectPanel();
            }

            onStop() {
              // Cleanup any in-flight highlight timers and restore styles
              this._highlightTimeouts.forEach((id) => clearTimeout(id));
              this._highlightTimeouts.clear();
              this._highlightedElements.forEach((element) => {
                const prevState = this.highlightStateByElement.get(element);
                if (prevState) {
                  element.style.outline = prevState.prevOutline;
                  element.style.outlineOffset = prevState.prevOutlineOffset;
                  element.style.boxShadow = prevState.prevBoxShadow;
                  this.highlightStateByElement.delete(element);
                }
              });
              this._highlightedElements.clear();

              // Cleanup any in-flight panel drag listeners (can remain if plugin is stopped mid-drag)
              if (this._panelDragHandlers) {
                document.removeEventListener(
                  'mousemove',
                  this._panelDragHandlers.onMouseMove,
                  true
                );
                document.removeEventListener('mouseup', this._panelDragHandlers.onMouseUp, true);
                this._panelDragHandlers = null;
              }
              this.removePanel();
            }

            analyzeCSS() {
              this.cssVariables.clear();
              this.usedVariables.clear();
              this.testResults.clear();
              this.selectorResults = [];
              this.focusedSelectorResults = [];
              this.sourceIndex.clear();
              this.remainingSelectorChecks =
                this.selectorScanCaps[this.selectorScanMode] ?? this.selectorScanCaps.capped;

              const sources = this.getLikelyCustomStyleSources();
              sources.forEach((source) => this.sourceIndex.set(source.sourceId, source));

              sources.forEach((source) => {
                const extraction = this.extractFromSource(source);
                extraction.variableDefinitions.forEach((def) => this.addVariableDefinition(def));
                extraction.variableUsages.forEach((usage) => this.addVariableUsage(usage));
                extraction.selectors.forEach((selectorResult) =>
                  this.selectorResults.push(selectorResult)
                );
              });

              // Noise filter: keep matched selectors, or unmatched only if from our theme/custom CSS sources
              const isRelevantSource = (sourceId = '') =>
                sourceId.includes('SoloLeveling-ClearVision-theme-container') ||
                sourceId.includes('customcss') ||
                sourceId.includes('bd-customcss');

              this.selectorResults = this.selectorResults.filter((entry) => {
                if (entry.status === 'matched') return true;
                const src = entry.context?.sourceId || '';
                return isRelevantSource(src);
              });

              this.runFocusedSelectorChecks();
              this.testComputedStyles();
            }

            testComputedStyles() {
              const probeElements = this.getProbeElements();

              this.cssVariables.forEach((variableEntry, name) => {
                const computed = this.getComputedVariable({ name, probeElements });
                const computedValue = computed.value ? computed.value.trim() : null;

                this.testResults.set(name, {
                  defined: variableEntry.defined,
                  applied: Boolean(computedValue),
                  appliedOn: computed.appliedOn || null,
                  computedValue,
                  definedValue: variableEntry.value || null,
                  definitions: variableEntry.definitions || [],
                  usedInPlugins: this.usedVariables.has(name),
                  usageCount: this.usedVariables.get(name)?.length || 0,
                });
              });

              // Variables used but never defined in scanned sources
              this.usedVariables.forEach((usages, name) => {
                if (this.testResults.has(name)) return;
                this.testResults.set(name, {
                  defined: false,
                  applied: false,
                  appliedOn: null,
                  computedValue: null,
                  definedValue: null,
                  definitions: [],
                  usedInPlugins: true,
                  usageCount: usages.length,
                });
              });
            }

            // -----------------------------
            // Source collection + extraction
            // -----------------------------
            getLikelyCustomStyleSources() {
              const stylesheets = Array.from(document.styleSheets || []);
              const sources = [];

              const makeSourceId = (ownerNode, href, index) => {
                const ownerId = ownerNode?.id ? `#${ownerNode.id}` : '';
                const ownerDataKeys = ownerNode
                  ? Object.keys(ownerNode.dataset || {})
                      .sort()
                      .join(',')
                  : '';
                const hrefKey = href ? `:${href}` : '';
                const dataKey = ownerDataKeys ? `:data(${ownerDataKeys})` : '';
                return `css_source_${index}${ownerId}${dataKey}${hrefKey}`;
              };

              const getOwnerType = (ownerNode) => {
                const tag = ownerNode?.tagName?.toLowerCase?.() || 'unknown';
                return tag;
              };

              const isLikelyCustomHref = (href) => {
                if (!href) return false;
                const hrefLower = href.toLowerCase();
                const isDiscordAsset =
                  hrefLower.includes('discord.com/assets') ||
                  hrefLower.includes('discordapp.com/assets') ||
                  hrefLower.includes('discordapp.net/assets');
                if (isDiscordAsset) return false;

                const markers = [
                  'betterdiscord',
                  '/themes/',
                  '.theme.css',
                  'theme.css',
                  '/plugins/',
                  'customcss',
                  'solo',
                  'sls',
                  'shadow',
                  'dungeon',
                ];
                const markerHit = markers.some((m) => hrefLower.includes(m));
                const endsWithCss = hrefLower.endsWith('.css');
                // Fallback: include any non-Discord .css link (often BD themes)
                return markerHit || endsWithCss;
              };

              const isLikelyCustomStyleTag = (ownerNode) => {
                if (!ownerNode || ownerNode.tagName !== 'STYLE') return false;
                const id = (ownerNode.id || '').toLowerCase();
                const dataKeys = Object.keys(ownerNode.dataset || {});
                const text = ownerNode.textContent || '';

                // Prefer stable “custom css” anchors and plugin-injected styles, avoid Discord core inline.
                const idMatch = id.includes('customcss') || id.includes('bd-customcss');
                const dataMatch = dataKeys.length > 0;
                const contentMatch = text.includes('--') || text.includes('var(--');
                return idMatch || dataMatch || contentMatch;
              };

              const isLikelyThemeLinkNode = (ownerNode) => {
                if (!ownerNode || ownerNode.tagName !== 'LINK') return false;
                const id = (ownerNode.id || '').toLowerCase();
                const rel = (ownerNode.getAttribute?.('rel') || '').toLowerCase();
                const className =
                  typeof ownerNode.className === 'string' ? ownerNode.className.toLowerCase() : '';
                const themeish =
                  id.includes('theme') || id.includes('bd') || className.includes('theme');
                const stylesheetRel = rel.includes('stylesheet');
                return stylesheetRel && themeish;
              };

              stylesheets.forEach((sheet, index) => {
                const ownerNode = sheet.ownerNode;
                const href = sheet.href || null;
                const ownerType = getOwnerType(ownerNode);

                const isCustom =
                  isLikelyCustomHref(href) ||
                  (ownerType === 'style' && isLikelyCustomStyleTag(ownerNode)) ||
                  (ownerType === 'link' && isLikelyThemeLinkNode(ownerNode));
                if (!isCustom) return;

                const sourceId = makeSourceId(ownerNode, href, index);
                const label =
                  href ||
                  ownerNode?.id ||
                  (ownerNode?.getAttribute?.('data-sls') && 'style[data-sls]') ||
                  (ownerNode?.getAttribute?.('data-shadow') && 'style[data-shadow]') ||
                  (ownerNode?.getAttribute?.('data-dungeon') && 'style[data-dungeon]') ||
                  `Inline style ${index}`;

                sources.push({
                  sourceId,
                  label,
                  href,
                  ownerType,
                  ownerNode,
                  sheet,
                });
              });

              return sources;
            }

            runFocusedSelectorChecks() {
              this.focusedSelectorResults = [];
              this.focusedSelectors.forEach((selector) => {
                try {
                  const matches = Array.from(document.querySelectorAll(selector));
                  this.focusedSelectorResults.push({
                    selector,
                    matchCount: matches.length,
                    matches: matches.slice(0, 5).map((el) => ({
                      summary: this.getElementSummary(el),
                      classList: Array.from(el.classList || []),
                      role: el.getAttribute('role') || null,
                      ariaLabel: el.getAttribute('aria-label') || null,
                      rect: (() => {
                        const r = el.getBoundingClientRect();
                        return { x: r.x, y: r.y, width: r.width, height: r.height };
                      })(),
                    })),
                  });
                } catch (error) {
                  this.focusedSelectorResults.push({
                    selector,
                    matchCount: 0,
                    matches: [],
                    error: error?.message || String(error),
                  });
                }
              });
            }

            extractFromSource(source) {
              const variableDefinitions = [];
              const variableUsages = [];
              const selectors = [];

              const safeGetRules = (sheet) => {
                try {
                  return Array.from(sheet.cssRules || []);
                } catch (error) {
                  return { error };
                }
              };

              const splitSelectorCache = new Map();

              const splitSelectors = (selectorText) => {
                if (!selectorText) return [];
                if (splitSelectorCache.has(selectorText))
                  return splitSelectorCache.get(selectorText);
                const parts = [];
                let current = '';
                let parenDepth = 0;
                let bracketDepth = 0;
                let inString = null;
                for (let i = 0; i < selectorText.length; i++) {
                  const ch = selectorText[i];
                  const prev = selectorText[i - 1];

                  const stringHandlers = {
                    '"': () => (inString === '"' && prev !== '\\' ? null : inString || '"'),
                    "'": () => (inString === "'" && prev !== '\\' ? null : inString || "'"),
                  };

                  if (stringHandlers[ch]) {
                    inString = stringHandlers[ch]();
                    current += ch;
                    continue;
                  }

                  if (inString) {
                    current += ch;
                    continue;
                  }

                  const depthUpdates = {
                    '(': () => {
                      parenDepth += 1;
                      current += ch;
                    },
                    ')': () => {
                      parenDepth = Math.max(0, parenDepth - 1);
                      current += ch;
                    },
                    '[': () => {
                      bracketDepth += 1;
                      current += ch;
                    },
                    ']': () => {
                      bracketDepth = Math.max(0, bracketDepth - 1);
                      current += ch;
                    },
                    ',': () => {
                      if (parenDepth === 0 && bracketDepth === 0) {
                        const trimmed = current.trim();
                        trimmed && parts.push(trimmed);
                        current = '';
                        return;
                      }
                      current += ch;
                    },
                  };

                  (depthUpdates[ch] || (() => (current += ch)))();
                }
                const finalTrimmed = current.trim();
                finalTrimmed && parts.push(finalTrimmed);
                splitSelectorCache.set(selectorText, parts);
                return parts;
              };

              const checkSelector = ({ selector, context }) => {
                const isCappedMode = this.selectorScanMode !== 'full';
                const shouldSkip =
                  (this.remainingSelectorChecks <= 0 && 'cap') ||
                  (isCappedMode && selector.length > 500 && 'long') ||
                  (isCappedMode && selector.includes(':has(') && 'has');

                if (shouldSkip) {
                  return {
                    status: 'skipped',
                    matchCount: 0,
                    selector,
                    context: { ...context, skipReason: shouldSkip },
                  };
                }

                this.remainingSelectorChecks = Math.max(0, this.remainingSelectorChecks - 1);
                try {
                  const element = document.querySelector(selector);
                  return element
                    ? {
                        status: 'matched',
                        matchCount: 1,
                        selector,
                        context,
                      }
                    : { status: 'unmatched', matchCount: 0, selector, context };
                } catch (error) {
                  return {
                    status: 'skipped',
                    matchCount: 0,
                    selector,
                    context: { ...context, error: error?.message || String(error) },
                  };
                }
              };

              const walkRules = (rules, context) => {
                rules.forEach((rule) => {
                  // STYLE_RULE
                  if (rule.type === 1 && rule.selectorText && rule.style) {
                    const selectorsList = splitSelectors(rule.selectorText);
                    selectorsList.forEach((selector) => {
                      selectors.push(
                        checkSelector({
                          selector,
                          context: { ...context, selectorText: rule.selectorText },
                        })
                      );
                    });

                    // Variable defs/usages from declarations
                    Array.from(rule.style || []).forEach((property) => {
                      const value = rule.style.getPropertyValue(property);
                      const trimmedProperty = String(property || '').trim();
                      const trimmedValue = String(value || '').trim();

                      if (trimmedProperty.startsWith('--')) {
                        variableDefinitions.push({
                          name: trimmedProperty.slice(2),
                          value: trimmedValue,
                          sourceId: source.sourceId,
                          selector: rule.selectorText,
                          context,
                        });
                      }

                      const valueText = trimmedValue;
                      const matches = valueText.matchAll(
                        /var\(--([a-zA-Z0-9-]+)\s*(?:,\s*[^)]+)?\)/g
                      );
                      Array.from(matches).forEach((m) => {
                        const name = m[1];
                        variableUsages.push({
                          name,
                          sourceId: source.sourceId,
                          selector: rule.selectorText,
                          property: trimmedProperty,
                          value: valueText,
                          context,
                        });
                      });
                    });

                    return;
                  }

                  // MEDIA_RULE / SUPPORTS_RULE / LAYER_RULE (walk nested rules)
                  const nestedRules = rule?.cssRules ? Array.from(rule.cssRules) : null;
                  if (!nestedRules) return;

                  const nextContext = {
                    ...context,
                    atRule:
                      rule.type === 4
                        ? { type: 'media', text: rule.media?.mediaText || '' }
                        : rule.type === 12
                        ? { type: 'supports', text: rule.conditionText || '' }
                        : rule.type === 18
                        ? { type: 'layer', text: rule.name || '' }
                        : null,
                  };

                  walkRules(nestedRules, nextContext);
                });
              };

              const rulesOrError = safeGetRules(source.sheet);
              const isAccessible = !rulesOrError?.error;
              const baseContext = {
                sourceId: source.sourceId,
                href: source.href,
              };

              this.sourceIndex.set(source.sourceId, {
                ...source,
                accessible: isAccessible,
                error: rulesOrError?.error
                  ? rulesOrError.error.message || String(rulesOrError.error)
                  : null,
              });

              if (!isAccessible) {
                return { variableDefinitions, variableUsages, selectors };
              }

              walkRules(rulesOrError, baseContext);

              return { variableDefinitions, variableUsages, selectors };
            }

            addVariableDefinition(definition) {
              if (!definition?.name) return;
              const existing = this.cssVariables.get(definition.name);
              const next = existing || {
                name: definition.name,
                value: definition.value,
                defined: true,
                definitions: [],
              };

              next.defined = true;
              next.value = next.value || definition.value;
              next.definitions.push({
                sourceId: definition.sourceId,
                selector: definition.selector || null,
                value: definition.value || null,
                context: definition.context || {},
              });

              this.cssVariables.set(definition.name, next);
            }

            addVariableUsage(usage) {
              if (!usage?.name) return;
              const usages = this.usedVariables.get(usage.name) || [];
              usages.push({
                sourceId: usage.sourceId,
                selector: usage.selector || null,
                property: usage.property || null,
                value: usage.value || null,
                context: usage.context || {},
              });
              this.usedVariables.set(usage.name, usages);
            }

            getProbeElements() {
              const candidates = [
                document.documentElement,
                document.body,
                document.querySelector('.theme-dark'),
                document.querySelector('.theme-light'),
                document.querySelector('[class*="appMount"]'),
              ].filter(Boolean);

              // Deduplicate while preserving order
              const seen = new Set();
              return candidates.filter((el) => {
                if (!el) return false;
                if (seen.has(el)) return false;
                seen.add(el);
                return true;
              });
            }

            describeElement(el) {
              if (!el) return null;
              const tag = el.tagName?.toLowerCase?.() || 'unknown';
              const id = el.id ? `#${el.id}` : '';
              const className =
                el.className && typeof el.className === 'string'
                  ? `.${el.className.split(/\s+/)[0]}`
                  : '';
              return `${tag}${id}${className}`;
            }

            getComputedVariable({ name, probeElements }) {
              const prop = `--${name}`;
              for (const el of probeElements) {
                try {
                  const value = getComputedStyle(el).getPropertyValue(prop);
                  const trimmed = value ? value.trim() : '';
                  if (trimmed) {
                    return { value: trimmed, appliedOn: this.describeElement(el) };
                  }
                } catch (e) {
                  // Ignore computed style issues for specific nodes
                }
              }
              return { value: null, appliedOn: null };
            }

            injectPanel() {
              const panel = this.createPanel();
              document.body.appendChild(panel);
            }

            removePanel() {
              const panel = document.getElementById('css-verification-panel');
              if (panel) panel.remove();
            }

            createPanel() {
              const panel = document.createElement('div');
              panel.id = 'css-verification-panel';
              panel.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 600px;
                height: 70vh;
                max-height: 90vh;
                max-width: 90vw;
                min-width: 380px;
                min-height: 260px;
                background: var(--background-secondary, #2f3136);
                border: 2px solid var(--main-color, #8a2be2);
                border-radius: 8px;
                padding: 0;
                z-index: 100000;
                overflow: hidden;
                resize: both;
                pointer-events: auto;
                box-shadow: 0 4px 20px rgba(138, 43, 226, 0.3);
                font-family: var(--main-font, 'Orbitron', sans-serif);
                color: var(--text-normal, #dcddde);
                display: flex;
                flex-direction: column;
              `;

              const results = Array.from(this.testResults.entries());
              const working = results.filter(([, r]) => r.defined && r.applied);
              const missing = results.filter(([, r]) => !r.defined && r.usedInPlugins);
              const unused = results.filter(([, r]) => r.defined && !r.usedInPlugins);
              const broken = results.filter(([, r]) => r.defined && !r.applied && r.usedInPlugins);

              const selectorMatched = this.selectorResults.filter((r) => r.status === 'matched');
              const selectorUnmatched = this.selectorResults.filter(
                (r) => r.status === 'unmatched'
              );
              const selectorSkipped = this.selectorResults.filter((r) => r.status === 'skipped');
              const sources = Array.from(this.sourceIndex.values());
              const accessibleSources = sources.filter((s) => s.accessible);
              const inaccessibleSources = sources.filter((s) => !s.accessible);

              panel.innerHTML = `
                <div id="css-verification-drag-handle" style="
                  flex: 0 0 auto;
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  gap: 12px;
                  padding: 12px 14px;
                  background: rgba(0, 0, 0, 0.18);
                  border-bottom: 1px solid var(--background-modifier-accent, #40444b);
                  cursor: move;
                  user-select: none;
                ">
                  <div style="display: flex; flex-direction: column; gap: 2px;">
                    <div style="font-size: 14px; font-weight: 700; color: var(--main-color, #8a2be2);">
                      CSS Verification
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted, #72767d);">
                      Drag to move. Resize from bottom-right corner.
                    </div>
                  </div>
                  <button id="css-verification-close-top" style="
                    background: var(--background-modifier-hover, rgba(4, 4, 5, 0.6));
                    color: var(--text-normal, #dcddde);
                    border: none;
                    padding: 6px 10px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 12px;
                  ">Close</button>
                </div>

                <div id="css-verification-content" style="
                  flex: 1 1 auto;
                  overflow: auto;
                  padding: 16px;
                ">
                  <div style="margin-bottom: 20px;">
                    <h2 style="color: var(--main-color, #8a2be2); margin: 0 0 10px 0; font-size: 20px;">
                      CSS Verification Report
                    </h2>
                    <div style="font-size: 12px; color: var(--text-muted, #72767d); margin-bottom: 12px;">
                      Sources scanned: ${accessibleSources.length} accessible, ${
                inaccessibleSources.length
              } inaccessible
                    <span style="margin-left: 10px;">| Selector scan: ${this.escapeHtml(
                      this.selectorScanMode
                    )} (remaining budget: ${this.remainingSelectorChecks})</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
                      <div style="background: rgba(0, 255, 136, 0.1); padding: 10px; border-radius: 4px; border: 1px solid #00ff88;">
                        <div style="font-size: 24px; font-weight: bold; color: #00ff88;">${
                          working.length
                        }</div>
                        <div style="font-size: 12px; color: var(--text-muted, #72767d);">Working</div>
                      </div>
                      <div style="background: rgba(255, 68, 68, 0.1); padding: 10px; border-radius: 4px; border: 1px solid #ff4444;">
                        <div style="font-size: 24px; font-weight: bold; color: #ff4444;">${
                          missing.length
                        }</div>
                        <div style="font-size: 12px; color: var(--text-muted, #72767d);">Missing</div>
                      </div>
                      <div style="background: rgba(255, 170, 0, 0.1); padding: 10px; border-radius: 4px; border: 1px solid #ffaa00;">
                        <div style="font-size: 24px; font-weight: bold; color: #ffaa00;">${
                          broken.length
                        }</div>
                        <div style="font-size: 12px; color: var(--text-muted, #72767d);">Broken</div>
                      </div>
                      <div style="background: rgba(139, 92, 246, 0.1); padding: 10px; border-radius: 4px; border: 1px solid #8b5cf6;">
                        <div style="font-size: 24px; font-weight: bold; color: #8b5cf6;">${
                          unused.length
                        }</div>
                        <div style="font-size: 12px; color: var(--text-muted, #72767d);">Unused</div>
                      </div>
                    </div>
                  </div>

                  ${this.renderSection('Working Variables', working, '#00ff88')}
                  ${this.renderSection(
                    'Missing Variables (Used but Not Defined)',
                    missing,
                    '#ff4444'
                  )}
                  ${this.renderSection(
                    'Broken Variables (Defined but Not Applied)',
                    broken,
                    '#ffaa00'
                  )}
                  ${this.renderSection(
                    'Unused Variables (Defined but Not Used)',
                    unused,
                    '#8b5cf6'
                  )}

                  <div style="margin-top: 20px; margin-bottom: 10px;">
                    <h3 style="color: var(--main-color, #8a2be2); margin: 0 0 10px 0; font-size: 16px; border-bottom: 2px solid var(--main-color, #8a2be2); padding-bottom: 5px;">
                      Selector Verification (custom styles only)
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                      <div style="background: rgba(0, 255, 136, 0.1); padding: 10px; border-radius: 4px; border: 1px solid #00ff88;">
                        <div style="font-size: 20px; font-weight: bold; color: #00ff88;">${
                          selectorMatched.length
                        }</div>
                        <div style="font-size: 12px; color: var(--text-muted, #72767d);">Matched</div>
                      </div>
                      <div style="background: rgba(255, 170, 0, 0.1); padding: 10px; border-radius: 4px; border: 1px solid #ffaa00;">
                        <div style="font-size: 20px; font-weight: bold; color: #ffaa00;">${
                          selectorUnmatched.length
                        }</div>
                        <div style="font-size: 12px; color: var(--text-muted, #72767d);">Unmatched</div>
                      </div>
                      <div style="background: rgba(139, 92, 246, 0.1); padding: 10px; border-radius: 4px; border: 1px solid #8b5cf6;">
                        <div style="font-size: 20px; font-weight: bold; color: #8b5cf6;">${
                          selectorSkipped.length
                        }</div>
                        <div style="font-size: 12px; color: var(--text-muted, #72767d);">Skipped</div>
                      </div>
                    </div>
                    <div style="margin-top: 10px; font-size: 12px; color: var(--text-muted, #72767d);">
                      Note: "Unmatched" means no elements match in the current DOM state. Some selectors only match on specific screens or states.
                    </div>
                    ${this.renderSelectorSection(
                      'Unmatched selectors (top 150)',
                      selectorUnmatched.slice(0, 150),
                      '#ffaa00'
                    )}
                    ${this.renderSelectorSection(
                      'Skipped selectors (top 80)',
                      selectorSkipped.slice(0, 80),
                      '#8b5cf6'
                    )}
                  </div>

                  <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--background-modifier-accent, #40444b);">
                    <button id="css-verification-refresh" style="
                      background: var(--brand-color, #5865f2);
                      color: white;
                      border: none;
                      padding: 10px 20px;
                      border-radius: 4px;
                      cursor: pointer;
                      font-family: inherit;
                      font-weight: bold;
                      margin-right: 10px;
                    ">Refresh Analysis</button>
                    <button id="css-verification-toggle-scan" style="
                      background: rgba(0,0,0,0.25);
                      color: var(--text-normal, #dcddde);
                      border: 1px solid rgba(139, 92, 246, 0.35);
                      padding: 10px 14px;
                      border-radius: 4px;
                      cursor: pointer;
                      font-family: inherit;
                      margin-right: 10px;
                    ">${
                      this.selectorScanMode === 'full'
                        ? 'Use Capped Selector Scan'
                        : 'Run Full Selector Scan'
                    }</button>
                    <button id="css-verification-export" style="
                      background: var(--background-modifier-hover, rgba(4, 4, 5, 0.6));
                      color: var(--text-normal, #dcddde);
                      border: none;
                      padding: 10px 20px;
                      border-radius: 4px;
                      cursor: pointer;
                      font-family: inherit;
                      margin-right: 10px;
                    ">Copy and Save Report JSON</button>
                    <button id="css-verification-close" style="
                      background: var(--background-modifier-hover, rgba(4, 4, 5, 0.6));
                      color: var(--text-normal, #dcddde);
                      border: none;
                      padding: 10px 20px;
                      border-radius: 4px;
                      cursor: pointer;
                      font-family: inherit;
                    ">Close</button>
                  </div>
                </div>
              `;

              // Add event listeners
              panel.querySelector('#css-verification-refresh').addEventListener('click', () => {
                this.analyzeCSS();
                panel.remove();
                this.injectPanel();
              });

              panel
                .querySelector('#css-verification-export')
                .addEventListener('click', async () => {
                  const report = this.buildExportReport();
                  const saveResult = this.trySaveReportJson(report);

                  const clipboardResult = await (async () => {
                    try {
                      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
                      return { ok: true };
                    } catch (error) {
                      return { ok: false, error };
                    }
                  })();

                  const status = {
                    clipboard: clipboardResult.ok ? 'copied' : 'failed to copy',
                    file: saveResult.ok ? `saved (${saveResult.fileName})` : 'failed to save',
                  };

                  const toastType =
                    (clipboardResult.ok && saveResult.ok && 'success') ||
                    ((clipboardResult.ok || saveResult.ok) && 'warning') ||
                    'error';

                  BdApi.showToast(`Report ${status.clipboard}; file ${status.file}`, {
                    type: toastType,
                    timeout: 4500,
                  });
                });

              panel.querySelector('#css-verification-close').addEventListener('click', () => {
                this.removePanel();
              });

              panel.querySelector('#css-verification-close-top').addEventListener('click', () => {
                this.removePanel();
              });

              panel.querySelector('#css-verification-toggle-scan').addEventListener('click', () => {
                const nextMode = this.selectorScanMode === 'full' ? 'capped' : 'full';
                this.selectorScanMode = nextMode;
                this.analyzeCSS();
                panel.remove();
                this.injectPanel();
              });

              // Delegate selector clicks to highlight affected DOM
              panel.addEventListener('click', (event) => {
                const target = event.target;
                if (!(target instanceof Element)) return;

                const clickable = target.closest('[data-css-verification-selector]');
                if (!clickable) return;

                const encodedSelector = clickable.getAttribute('data-css-verification-selector');
                if (!encodedSelector) return;

                event.preventDefault();
                event.stopPropagation();

                const selector = this.decodeSelectorFromAttr(encodedSelector);
                selector && this.focusSelector(selector);
              });

              // Drag-to-move behavior
              const dragHandle = panel.querySelector('#css-verification-drag-handle');
              const state = { isDragging: false, offsetX: 0, offsetY: 0 };

              const onMouseMove = (e) => {
                if (!state.isDragging) return;
                const nextLeft = e.clientX - state.offsetX;
                const nextTop = e.clientY - state.offsetY;

                const maxLeft = window.innerWidth - panel.offsetWidth;
                const maxTop = window.innerHeight - panel.offsetHeight;

                panel.style.left = `${Math.min(Math.max(0, nextLeft), Math.max(0, maxLeft))}px`;
                panel.style.top = `${Math.min(Math.max(0, nextTop), Math.max(0, maxTop))}px`;
              };

              const onMouseUp = () => {
                if (!state.isDragging) return;
                state.isDragging = false;
                document.removeEventListener('mousemove', onMouseMove, true);
                document.removeEventListener('mouseup', onMouseUp, true);
                this._panelDragHandlers = null;
              };

              dragHandle.addEventListener('mousedown', (e) => {
                // Ignore dragging if user clicks a button in the handle
                if (e.target && e.target.closest && e.target.closest('button')) return;
                e.preventDefault();

                const rect = panel.getBoundingClientRect();
                panel.style.left = `${rect.left}px`;
                panel.style.top = `${rect.top}px`;
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';

                state.isDragging = true;
                state.offsetX = e.clientX - rect.left;
                state.offsetY = e.clientY - rect.top;

                this._panelDragHandlers = { onMouseMove, onMouseUp };
                document.addEventListener('mousemove', onMouseMove, true);
                document.addEventListener('mouseup', onMouseUp, true);
              });

              return panel;
            }

            renderSection(title, items, color) {
              if (items.length === 0) return '';

              return `
                <div style="margin-bottom: 20px;">
                  <h3 style="color: ${color}; margin: 0 0 10px 0; font-size: 16px; border-bottom: 2px solid ${color}; padding-bottom: 5px;">
                    ${title} (${items.length})
                  </h3>
                  <div style="max-height: 300px; overflow-y: auto;">
                    ${items
                      .map(([name, result]) => this.renderVariable(name, result, color))
                      .join('')}
                  </div>
                </div>
              `;
            }

            renderVariable(name, result, color) {
              const usages = this.usedVariables.get(name) || [];
              const usageDetails = usages.length
                ? usages
                    .slice(0, 3)
                    .map((u) => {
                      const sourceLabel = this.getSourceLabel(u.sourceId);
                      const selectorLabel = u.selector ? this.escapeHtml(u.selector) : '';
                      const propertyLabel = u.property ? this.escapeHtml(u.property) : '';
                      const valueLabel = u.value
                        ? this.escapeHtml(String(u.value).slice(0, 80))
                        : '';
                      const selectorChip = u.selector
                        ? this.renderSelectorChip(u.selector, color)
                        : '';
                      return `<div style="font-size: 11px; color: var(--text-muted, #72767d); margin-top: 3px; padding-left: 10px; border-left: 2px solid ${color}40;">
                        <div><strong>Source:</strong> ${this.escapeHtml(sourceLabel)}</div>
                        ${
                          selectorLabel
                            ? `<div><strong>Selector:</strong> ${selectorChip}</div>`
                            : ''
                        }
                        ${
                          propertyLabel
                            ? `<div><strong>Property:</strong> ${propertyLabel}</div>`
                            : ''
                        }
                        ${
                          valueLabel
                            ? `<div><strong>Value:</strong> <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 2px; font-size: 10px;">${valueLabel}${
                                String(u.value || '').length > 80 ? '...' : ''
                              }</code></div>`
                            : ''
                        }
                      </div>`;
                    })
                    .join('')
                : '';

              const definitionDetails =
                result.definitions && result.definitions.length
                  ? result.definitions
                      .slice(0, 3)
                      .map((d) => {
                        const sourceLabel = this.getSourceLabel(d.sourceId);
                        const selectorLabel = d.selector ? this.escapeHtml(d.selector) : '';
                        const valueLabel = d.value
                          ? this.escapeHtml(String(d.value).slice(0, 80))
                          : '';
                        const selectorChip = d.selector
                          ? this.renderSelectorChip(d.selector, color)
                          : '';
                        return `<div style="font-size: 11px; color: var(--text-muted, #72767d); margin-top: 3px; padding-left: 10px; border-left: 2px solid ${color}40;">
                          <div><strong>Defined in:</strong> ${this.escapeHtml(sourceLabel)}</div>
                          ${
                            selectorLabel
                              ? `<div><strong>Selector:</strong> ${selectorChip}</div>`
                              : ''
                          }
                          ${
                            valueLabel
                              ? `<div><strong>Value:</strong> <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 2px; font-size: 10px;">${valueLabel}${
                                  String(d.value || '').length > 80 ? '...' : ''
                                }</code></div>`
                              : ''
                          }
                        </div>`;
                      })
                      .join('')
                  : '';

              return `
                <div style="
                  background: ${color}15;
                  border-left: 3px solid ${color};
                  padding: 10px;
                  margin-bottom: 8px;
                  border-radius: 4px;
                ">
                  <div style="font-weight: bold; color: ${color}; margin-bottom: 5px; font-family: monospace;">
                    --${name}
                  </div>
                  ${
                    result.definedValue
                      ? `<div style="font-size: 12px; color: var(--text-muted, #72767d); margin-bottom: 3px;">
                    <strong>Defined:</strong> <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 2px; font-size: 11px;">${this.escapeHtml(
                      result.definedValue
                    )}</code>
                  </div>`
                      : ''
                  }
                  ${
                    result.computedValue
                      ? `<div style="font-size: 12px; color: var(--text-muted, #72767d); margin-bottom: 3px;">
                    <strong>Computed:</strong> <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 2px; font-size: 11px;">${this.escapeHtml(
                      result.computedValue
                    )}</code>
                    ${
                      result.appliedOn
                        ? `<span style="margin-left: 8px; font-size: 11px;">(${this.escapeHtml(
                            result.appliedOn
                          )})</span>`
                        : ''
                    }
                  </div>`
                      : ''
                  }
                  ${
                    definitionDetails
                      ? `<div style="margin-top: 5px;">${definitionDetails}</div>`
                      : ''
                  }
                  ${
                    result.usedInPlugins
                      ? `<div style="font-size: 12px; color: var(--text-muted, #72767d); margin-top: 5px;">
                    <strong>Used:</strong> ${result.usageCount} time(s) in scanned styles
                    ${usageDetails ? `<div style="margin-top: 5px;">${usageDetails}</div>` : ''}
                  </div>`
                      : ''
                  }
                  ${
                    !result.defined && result.usedInPlugins
                      ? `<div style="font-size: 12px; color: #ff4444; margin-top: 5px; font-weight: bold;">
                    Missing: Used in custom CSS but not defined in scanned sources.
                  </div>`
                      : ''
                  }
                  ${
                    result.defined && !result.applied
                      ? `<div style="font-size: 12px; color: #ffaa00; margin-top: 5px; font-weight: bold;">
                    Not applied: Defined but no computed value found on probe elements.
                  </div>`
                      : ''
                  }
                </div>
              `;
            }

            renderSelectorSection(title, items, color) {
              if (!items.length) return '';
              return `
                <div style="margin-top: 12px;">
                  <h4 style="color: ${color}; margin: 0 0 8px 0; font-size: 14px; border-bottom: 1px solid ${color}; padding-bottom: 4px;">
                    ${title} (${items.length})
                  </h4>
                  <div style="max-height: 260px; overflow-y: auto;">
                    ${items.map((r) => this.renderSelectorRow(r, color)).join('')}
                  </div>
                </div>
              `;
            }

            renderSelectorRow(result, color) {
              const sourceLabel = this.getSourceLabel(result.context?.sourceId || result.sourceId);
              const selector = result.selector || '';
              const error = result.context?.error || null;
              const atRule = result.context?.atRule;
              const atRuleText = atRule?.text ? `@${atRule.type} ${atRule.text}` : '';
              const selectorChip = selector ? this.renderSelectorChip(selector, color) : '';
              return `
                <div style="
                  background: ${color}12;
                  border-left: 3px solid ${color};
                  padding: 8px 10px;
                  margin-bottom: 6px;
                  border-radius: 4px;
                ">
                  <div style="font-family: monospace; font-size: 12px; color: ${color};">
                    ${selectorChip || this.escapeHtml(selector)}
                  </div>
                  <div style="margin-top: 4px; font-size: 11px; color: var(--text-muted, #72767d);">
                    <div><strong>Source:</strong> ${this.escapeHtml(sourceLabel)}</div>
                    ${
                      atRuleText
                        ? `<div><strong>Context:</strong> ${this.escapeHtml(atRuleText)}</div>`
                        : ''
                    }
                    ${
                      typeof result.matchCount === 'number'
                        ? `<div><strong>Matches:</strong> ${result.matchCount}</div>`
                        : ''
                    }
                    ${
                      error
                        ? `<div style="color: #ff4444;"><strong>Error:</strong> ${this.escapeHtml(
                            error
                          )}</div>`
                        : ''
                    }
                  </div>
                </div>
              `;
            }

            getSourceLabel(sourceId) {
              if (!sourceId) return 'unknown';
              const source = this.sourceIndex.get(sourceId);
              if (!source) return sourceId;
              const href = source.href ? ` (${source.href})` : '';
              return `${source.label || sourceId}${href}`;
            }

            renderSelectorChip(selector, color) {
              const encoded = this.encodeSelectorForAttr(selector);
              const safePreview = this.escapeHtml(selector);
              return `<button type="button"
                data-css-verification-selector="${encoded}"
                style="
                  appearance: none;
                  background: rgba(0,0,0,0.25);
                  color: ${color};
                  border: 1px solid ${color}55;
                  border-radius: 4px;
                  padding: 2px 6px;
                  cursor: pointer;
                  font-family: monospace;
                  font-size: 10px;
                  line-height: 1.3;
                  text-align: left;
                "
                title="Click to highlight affected element"
              >${safePreview}</button>`;
            }

            encodeSelectorForAttr(selector) {
              try {
                return encodeURIComponent(selector);
              } catch (e) {
                return '';
              }
            }

            decodeSelectorFromAttr(encoded) {
              try {
                return decodeURIComponent(encoded);
              } catch (e) {
                return null;
              }
            }

            focusSelector(selector) {
              if (!selector || typeof selector !== 'string') return;
              let element = null;
              try {
                element = document.querySelector(selector);
              } catch (error) {
                BdApi.showToast(`Invalid selector: ${selector}`, { type: 'error', timeout: 3000 });
                return;
              }

              if (!element) {
                BdApi.showToast('No element matched that selector (in current view)', {
                  type: 'warning',
                  timeout: 3000,
                });
                return;
              }

              try {
                element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
              } catch (e) {
                // ignore
              }

              this.highlightElement(element);
            }

            highlightElement(element) {
              if (!element) return;

              const prevState = this.highlightStateByElement.get(element);
              if (prevState?.timer) {
                this._highlightTimeouts.delete(prevState.timer);
                clearTimeout(prevState.timer);
              }

              const prevOutline = element.style.outline;
              const prevOutlineOffset = element.style.outlineOffset;
              const prevBoxShadow = element.style.boxShadow;

              element.style.outline = '3px solid rgba(138, 43, 226, 0.9)';
              element.style.outlineOffset = '2px';
              element.style.boxShadow = '0 0 0 4px rgba(138, 43, 226, 0.18)';

              const timer = setTimeout(() => {
                element.style.outline = prevOutline;
                element.style.outlineOffset = prevOutlineOffset;
                element.style.boxShadow = prevBoxShadow;
                this.highlightStateByElement.delete(element);
                this._highlightTimeouts.delete(timer);
                this._highlightedElements.delete(element);
              }, 2200);

              this._highlightTimeouts.add(timer);
              this._highlightedElements.add(element);
              this.highlightStateByElement.set(element, {
                prevOutline,
                prevOutlineOffset,
                prevBoxShadow,
                timer,
              });
            }

            buildExportReport() {
              const variables = Array.from(this.testResults.entries()).map(([name, r]) => ({
                name,
                defined: r.defined,
                applied: r.applied,
                appliedOn: r.appliedOn,
                computedValue: r.computedValue,
                definedValue: r.definedValue,
                used: r.usedInPlugins,
                usageCount: r.usageCount,
                definitions: (r.definitions || []).slice(0, 20),
                usages: (this.usedVariables.get(name) || []).slice(0, 50),
              }));

              return {
                generatedAt: new Date().toISOString(),
                sources: Array.from(this.sourceIndex.values()).map((s) => ({
                  sourceId: s.sourceId,
                  label: s.label,
                  href: s.href,
                  ownerType: s.ownerType,
                  accessible: Boolean(s.accessible),
                  error: s.error || null,
                })),
                summary: {
                  variables: {
                    total: variables.length,
                    working: variables.filter((v) => v.defined && v.applied).length,
                    missing: variables.filter((v) => !v.defined && v.used).length,
                    broken: variables.filter((v) => v.defined && !v.applied && v.used).length,
                    unused: variables.filter((v) => v.defined && !v.used).length,
                  },
                  selectors: {
                    total: this.selectorResults.length,
                    matched: this.selectorResults.filter((s) => s.status === 'matched').length,
                    unmatched: this.selectorResults.filter((s) => s.status === 'unmatched').length,
                    skipped: this.selectorResults.filter((s) => s.status === 'skipped').length,
                  },
                },
                variables,
                selectors: this.selectorResults.slice(0, 2000),
              };
            }

            trySaveReportJson(report) {
              const errorResult = (error) => ({
                ok: false,
                error: error?.message || String(error),
                filePath: null,
                fileName: null,
              });

              try {
                const fs = require('fs');
                const path = require('path');

                // With your symlink setup, this resolves to:
                // .../Documents/DEVELOPMENT/betterdiscord-dev/plugins/CSSVerification.plugin.js
                const realPluginPath = fs.realpathSync(__filename);
                const pluginsDir = path.dirname(realPluginPath); // .../betterdiscord-dev/plugins
                const devRootDir = path.resolve(pluginsDir, '..'); // .../betterdiscord-dev
                const reportsDir = path.join(devRootDir, 'reports', 'css-verification');

                fs.mkdirSync(reportsDir, { recursive: true });

                const fileName = `css-verification-report-${this.getTimestampForFilename()}.json`;
                const filePath = path.join(reportsDir, fileName);

                fs.writeFileSync(filePath, JSON.stringify(report, null, 2), { encoding: 'utf8' });

                return { ok: true, filePath, fileName, error: null };
              } catch (error) {
                return errorResult(error);
              }
            }

            getTimestampForFilename() {
              // 2025-12-11T16-48-12-123Z (safe for filenames)
              return new Date().toISOString().replace(/[:.]/g, '-');
            }

            escapeHtml(text) {
              const div = document.createElement('div');
              div.textContent = text;
              return div.innerHTML;
            }

            getSettingsPanel() {
              return this.createSettingsPanel();
            }

            createSettingsPanel() {
              const panel = document.createElement('div');
              panel.style.cssText = 'padding: 20px;';
              panel.innerHTML = `
                <div>
                  <h2 style="color: var(--main-color, #8a2be2);">CSS Verification Tool</h2>
                  <p>This plugin analyzes your Solo Leveling theme CSS and verifies which CSS variables are working.</p>
                  <button id="css-verification-open" style="
                    background: var(--brand-color, #5865f2);
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                    margin-top: 10px;
                  ">Open Verification Panel</button>
                </div>
              `;

              panel.querySelector('#css-verification-open').addEventListener('click', () => {
                this.removePanel();
                this.injectPanel();
              });

              return panel;
            }
          };
        };
        return plugin(Plugin, Api);
      })(window.ZeresPluginLibrary.buildPlugin(config));
})();
