/**
 * @name CSS Picker
 * @author BlueFlashX1
 * @description Hover to inspect, click once to capture element details and selector candidates. Copies JSON and saves a report into betterdiscord-dev.
 * @version 1.0.0
 * @authorId
 */

module.exports = (() => {
  const config = {
    info: {
      name: 'CSS Picker',
      authors: [
        {
          name: 'BlueFlashX1',
          discord_id: '',
        },
      ],
      version: '1.0.0',
      description:
        'Hover to inspect, click once to capture element details and selector candidates. Copies JSON and saves a report into betterdiscord-dev.',
    },
  };

  const PLUGIN_NAME = config.info.name;

  const safeToast = (message, options = {}) => {
    try {
      BdApi.showToast(message, { timeout: 3000, ...options });
    } catch (e) {
      // ignore
    }
  };

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  };

  const getTimestampForFilename = () => new Date().toISOString().replace(/[:.]/g, '-');

  const getElementSummary = (el) => {
    if (!el) return 'unknown';
    const tag = el.tagName?.toLowerCase?.() || 'unknown';
    const id = el.id ? `#${el.id}` : '';
    const className =
      typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/)[0]}`
        : '';
    return `${tag}${id}${className}`;
  };

  const isUniqueSelector = (selector) => {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (e) {
      return false;
    }
  };

  const getSemanticClassSelectors = (el) => {
    if (!el?.classList) return [];

    const classes = Array.from(el.classList);
    const semanticPrefixes = classes
      .map((c) => {
        // Discord pattern: name_hash or name__hash
        const match = c.match(/^([a-zA-Z]+)[_]{1,2}[a-zA-Z0-9]+$/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    const uniquePrefixes = Array.from(new Set(semanticPrefixes)).slice(0, 3);
    return uniquePrefixes.map((prefix) => `[class^="${prefix}_"]`);
  };

  const buildNthOfTypePath = (el, maxDepth = 6) => {
    const parts = [];
    let current = el;

    for (let depth = 0; depth < maxDepth && current && current.nodeType === 1; depth++) {
      const tag = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }

      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName && c.tagName.toLowerCase() === tag
      );
      const index = siblings.indexOf(current) + 1;
      const segment = siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag;
      parts.unshift(segment);

      current = parent;
      if (tag === 'html' || tag === 'body') break;
    }

    return parts.join(' > ');
  };

  const getAttributeSelectorCandidates = (el) => {
    if (!el || !(el instanceof Element)) return [];

    const ariaLabel = el.getAttribute('aria-label');
    const role = el.getAttribute('role');
    const dataTestId = el.getAttribute('data-testid');

    const candidates = [];

    // Prefer stable attributes (may be localized for aria-label, but still useful).
    ariaLabel &&
      ariaLabel.length <= 80 &&
      candidates.push(`${el.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`);
    role && candidates.push(`${el.tagName.toLowerCase()}[role="${role}"]`);
    dataTestId && candidates.push(`${el.tagName.toLowerCase()}[data-testid="${dataTestId}"]`);

    return candidates;
  };

  const getSelectorCandidates = (el) => {
    if (!el || !(el instanceof Element)) return [];

    const candidates = [];

    // #id if unique
    if (el.id) {
      const idSel = `#${CSS.escape(el.id)}`;
      candidates.push(idSel);
    }

    getAttributeSelectorCandidates(el).forEach((s) => candidates.push(s));

    // Semantic discord classes via [class^="name_"]
    getSemanticClassSelectors(el).forEach((s) =>
      candidates.push(`${el.tagName.toLowerCase()}${s}`)
    );

    // Full path fallback (not stable but always works in the current DOM)
    candidates.push(buildNthOfTypePath(el));

    // Dedup + drop empties
    return Array.from(new Set(candidates)).filter(Boolean);
  };

  const getElementNodeInfo = (el) => {
    if (!el || !(el instanceof Element)) return null;

    const tagName = el.tagName.toLowerCase();
    const id = el.id || null;
    const classList = Array.from(el.classList || []);
    const role = el.getAttribute('role') || null;
    const ariaLabel = el.getAttribute('aria-label') || null;

    return {
      summary: getElementSummary(el),
      tagName,
      id,
      classList,
      role,
      ariaLabel,
    };
  };

  const getAncestry = (el, maxDepth = 10) => {
    const chain = [];
    let current = el;

    for (let depth = 0; depth < maxDepth && current && current.nodeType === 1; depth++) {
      const node = getElementNodeInfo(current);
      if (!node) break;

      chain.push({
        depth,
        ...node,
        selectorCandidates: getSelectorCandidates(current).slice(0, 8),
      });

      current = current.parentElement;
      if (!current) break;
      if (current.tagName && ['HTML', 'BODY'].includes(current.tagName)) {
        const rootNode = getElementNodeInfo(current);
        rootNode &&
          chain.push({
            depth: depth + 1,
            ...rootNode,
            selectorCandidates: getSelectorCandidates(current).slice(0, 8),
          });
        break;
      }
    }

    return chain;
  };

  const getElementDetails = (el) => {
    if (!el || !(el instanceof Element)) return null;

    const MAX_SELECTOR_CANDIDATES = 8;
    const MAX_UNIQUE_CHECKS = 2;

    const rect = el.getBoundingClientRect();
    const classList = Array.from(el.classList || []);
    const childrenCount = el.children ? el.children.length : 0;
    const firstChildSummary = el.firstElementChild ? getElementSummary(el.firstElementChild) : null;
    const parentSummary = el.parentElement ? getElementSummary(el.parentElement) : null;

    const attributes = Array.from(el.attributes || [])
      .map((a) => ({ name: a.name, value: a.value }))
      .slice(0, 40);

    const selectorCandidates = getSelectorCandidates(el)
      .slice(0, MAX_SELECTOR_CANDIDATES)
      .map((selector, index) => {
        const base = {
          selector,
          isValid: false,
          matchesNow: false,
          isUnique: null,
        };

        try {
          const match = document.querySelector(selector);
          const matchesNow = Boolean(match);
          const shouldCheckUniqueness = matchesNow && index < MAX_UNIQUE_CHECKS;

          return {
            ...base,
            isValid: true,
            matchesNow,
            isUnique: shouldCheckUniqueness ? isUniqueSelector(selector) : null,
          };
        } catch (e) {
          return base;
        }
      });

    return {
      capturedAt: new Date().toISOString(),
      summary: getElementSummary(el),
      tagName: el.tagName.toLowerCase(),
      id: el.id || null,
      classList,
      parentSummary,
      childrenSummary: {
        count: childrenCount,
        firstChild: firstChildSummary,
      },
      attributes,
      textPreview: (el.textContent || '').trim().slice(0, 200) || null,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
      },
      selectorCandidates,
      ancestry: getAncestry(el, 10),
    };
  };

  const trySaveReportJson = (report) => {
    const errorResult = (error) => ({
      ok: false,
      error: error?.message || String(error),
      filePath: null,
      fileName: null,
    });

    try {
      const fs = require('fs');
      const path = require('path');

      const realPluginPath = fs.realpathSync(__filename);
      const pluginsDir = path.dirname(realPluginPath); // .../betterdiscord-dev/plugins
      const devRootDir = path.resolve(pluginsDir, '..'); // .../betterdiscord-dev
      const reportsDir = path.join(devRootDir, 'reports', 'css-picker');

      fs.mkdirSync(reportsDir, { recursive: true });

      const fileName = `css-picker-${getTimestampForFilename()}.json`;
      const filePath = path.join(reportsDir, fileName);

      fs.writeFileSync(filePath, JSON.stringify(report, null, 2), { encoding: 'utf8' });

      return { ok: true, filePath, fileName, error: null };
    } catch (error) {
      return errorResult(error);
    }
  };

  const tryCopyJsonToClipboard = async (report) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  };

  const createOverlay = () => {
    const overlay = document.createElement('div');
    overlay.id = 'css-picker-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 100000;
      border: 2px solid rgba(138, 43, 226, 0.95);
      border-radius: 6px;
      background: transparent;
      box-shadow: none;
    `;
    return overlay;
  };

  const createLauncherButton = () => {
    const button = document.createElement('button');
    button.id = 'css-picker-launcher';
    button.type = 'button';
    button.textContent = 'Start CSS Picker';
    button.style.cssText = `
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 100002;
      background: var(--brand-color, #5865f2);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 10px 12px;
      cursor: pointer;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.2px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      font-family: var(--font-primary, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial);
      opacity: 0.96;
    `;
    return button;
  };

  const createTooltip = () => {
    const tooltip = document.createElement('div');
    tooltip.id = 'css-picker-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      top: 16px;
      left: 16px;
      max-width: 520px;
      z-index: 100001;
      pointer-events: none;
      background: rgba(17, 18, 20, 0.92);
      border: 1px solid rgba(88, 101, 242, 0.65);
      border-radius: 8px;
      padding: 10px 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
      color: #dcddde;
      box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
    `;
    tooltip.innerHTML = '<div style="opacity: 0.85;">CSS Picker active</div>';
    return tooltip;
  };

  const updateTooltip = ({ tooltip, el }) => {
    const summary = getElementSummary(el);
    const candidates = getSelectorCandidates(el).slice(0, 3);

    tooltip.innerHTML = `
      <div style="display:flex; justify-content: space-between; gap: 8px; align-items: baseline;">
        <div><strong>${escapeHtml(summary)}</strong></div>
        <div style="opacity: 0.7;">click to capture, esc to cancel</div>
      </div>
      <div style="margin-top: 6px; opacity: 0.9;">
        <div style="opacity: 0.75; margin-bottom: 4px;">Selector candidates:</div>
        ${candidates
          .map(
            (s) =>
              `<div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.95;">${escapeHtml(
                s
              )}</div>`
          )
          .join('')}
      </div>
    `;
  };

  const positionOverlayOnElement = ({ overlay, el }) => {
    const rect = el.getBoundingClientRect();

    // Ignore zero-size targets (e.g., hidden)
    if (!rect.width || !rect.height) return;

    overlay.style.top = `${Math.max(0, rect.top)}px`;
    overlay.style.left = `${Math.max(0, rect.left)}px`;
    overlay.style.width = `${Math.max(0, rect.width)}px`;
    overlay.style.height = `${Math.max(0, rect.height)}px`;
  };

  return class CSSPicker {
    start() {
      this.isActive = false;
      this.lastHoverElement = null;

      this.overlay = null;
      this.tooltip = null;
      this.launcher = null;

      this.onMouseMove = null;
      this.onClick = null;
      this.onKeyDown = null;
      this.hoverRafId = null;
      this.pendingHoverPoint = null;
      this._launcherClickHandler = null;

      this.injectLauncher();
      safeToast('CSS Picker loaded. Open settings to start pick mode.', { type: 'info' });
    }

    stop() {
      this.deactivatePickMode();
      this.removeLauncher();
    }

    getSettingsPanel() {
      const panel = document.createElement('div');
      panel.style.cssText = 'padding: 16px;';

      panel.innerHTML = `
        <div>
          <h2 style="margin: 0 0 8px 0;">CSS Picker</h2>
          <p style="margin: 0 0 12px 0; opacity: 0.8;">
            Click Start, then hover anything in Discord and click once to capture selectors.
            It captures only once per activation.
          </p>
          <button id="css-picker-start" style="
            background: var(--brand-color, #5865f2);
            color: white;
            border: none;
            padding: 10px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            margin-right: 10px;
          ">Start pick mode (one capture)</button>
          <button id="css-picker-stop" style="
            background: rgba(4, 4, 5, 0.6);
            color: var(--text-normal, #dcddde);
            border: none;
            padding: 10px 14px;
            border-radius: 6px;
            cursor: pointer;
          ">Stop</button>
        </div>
      `;

      panel.querySelector('#css-picker-start').addEventListener('click', () => {
        this.activatePickMode();
      });

      panel.querySelector('#css-picker-stop').addEventListener('click', () => {
        this.deactivatePickMode();
      });

      return panel;
    }

    activatePickMode() {
      if (this.isActive) return;
      this.isActive = true;

      this.overlay = createOverlay();
      this.tooltip = createTooltip();

      document.body.appendChild(this.overlay);
      document.body.appendChild(this.tooltip);

      const getTargetFromPoint = (x, y) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        if (el.closest && el.closest('#css-picker-launcher')) return null;
        if (el === this.overlay || el === this.tooltip) return null;
        if (el.closest && el.closest('#css-picker-overlay')) return null;
        if (el.closest && el.closest('#css-picker-tooltip')) return null;
        return el;
      };

      this.onMouseMove = (event) => {
        if (!this.isActive) return;
        this.pendingHoverPoint = { x: event.clientX, y: event.clientY };
        if (this.hoverRafId) return;

        this.hoverRafId = requestAnimationFrame(() => {
          this.hoverRafId = null;
          if (!this.isActive || !this.pendingHoverPoint) return;

          const { x, y } = this.pendingHoverPoint;
          this.pendingHoverPoint = null;

          const target = getTargetFromPoint(x, y);
          if (!target || !(target instanceof Element)) return;

          if (target === this.lastHoverElement) return;
          this.lastHoverElement = target;

          positionOverlayOnElement({ overlay: this.overlay, el: target });
          updateTooltip({ tooltip: this.tooltip, el: target });
        });
      };

      this.onClick = async (event) => {
        if (!this.isActive) return;

        // Capture exactly once per activation
        if (event.target && event.target.closest && event.target.closest('#css-picker-launcher')) {
          return;
        }

        const target = getTargetFromPoint(event.clientX, event.clientY);
        if (!target || !(target instanceof Element)) {
          safeToast('No element found to capture', { type: 'error' });
          this.deactivatePickMode();
          return;
        }

        const report = {
          plugin: PLUGIN_NAME,
          version: config.info.version,
          url: window.location.href,
          element: getElementDetails(target),
        };

        const saveResult = trySaveReportJson(report);
        const clipboardResult = await tryCopyJsonToClipboard(report);

        const toastType =
          (saveResult.ok && clipboardResult.ok && 'success') ||
          ((saveResult.ok || clipboardResult.ok) && 'warning') ||
          'error';

        const fileMsg = saveResult.ok ? `saved (${saveResult.fileName})` : 'failed to save';
        const clipMsg = clipboardResult.ok ? 'copied' : 'failed to copy';

        safeToast(`Captured: ${clipMsg}; file ${fileMsg}`, { type: toastType, timeout: 4500 });

        this.deactivatePickMode();
      };

      this.onKeyDown = (event) => {
        if (!this.isActive) return;
        if (event.key !== 'Escape') return;

        event.preventDefault();
        event.stopPropagation();

        safeToast('CSS Picker cancelled', { type: 'info' });
        this.deactivatePickMode();
      };

      document.addEventListener('mousemove', this.onMouseMove, true);
      document.addEventListener('click', this.onClick, true);
      document.addEventListener('keydown', this.onKeyDown, true);

      this.updateLauncherState();
      safeToast('CSS Picker active: hover and click once to capture. Press Esc to cancel.', {
        type: 'info',
        timeout: 5000,
      });
    }

    deactivatePickMode() {
      if (!this.isActive) {
        // Still clean up in case
        this.removeArtifacts();
        return;
      }

      this.isActive = false;
      this.lastHoverElement = null;

      if (this.onMouseMove) document.removeEventListener('mousemove', this.onMouseMove, true);
      if (this.onClick) document.removeEventListener('click', this.onClick, true);
      if (this.onKeyDown) document.removeEventListener('keydown', this.onKeyDown, true);

      this.onMouseMove = null;
      this.onClick = null;
      this.onKeyDown = null;
      this.pendingHoverPoint = null;
      this.hoverRafId && cancelAnimationFrame(this.hoverRafId);
      this.hoverRafId = null;

      this.removeArtifacts();
      this.updateLauncherState();
    }

    removeArtifacts() {
      try {
        this.overlay?.remove();
      } catch (e) {
        // ignore
      }
      try {
        this.tooltip?.remove();
      } catch (e) {
        // ignore
      }
      this.overlay = null;
      this.tooltip = null;
    }

    injectLauncher() {
      if (this.launcher && document.body.contains(this.launcher)) return;
      this.launcher = this.launcher || createLauncherButton();

      this._launcherClickHandler =
        this._launcherClickHandler ||
        (() => {
          (this.isActive && this.deactivatePickMode()) || this.activatePickMode();
        });
      this.launcher.removeEventListener('click', this._launcherClickHandler);
      this.launcher.addEventListener('click', this._launcherClickHandler);

      document.body.appendChild(this.launcher);
      this.updateLauncherState();
    }

    removeLauncher() {
      try {
        this.launcher &&
          this._launcherClickHandler &&
          this.launcher.removeEventListener('click', this._launcherClickHandler);
        this.launcher?.remove();
      } catch (e) {
        // ignore
      }
      this.launcher = null;
    }

    updateLauncherState() {
      if (!this.launcher) return;
      const states = {
        active: { text: 'Cancel CSS Picker', opacity: '0.82' },
        inactive: { text: 'Start CSS Picker', opacity: '0.96' },
      };
      const next = this.isActive ? states.active : states.inactive;
      this.launcher.textContent = next.text;
      this.launcher.style.opacity = next.opacity;
    }
  };
})();
