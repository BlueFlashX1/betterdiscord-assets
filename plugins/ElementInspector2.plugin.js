/**
 * @name ElementInspector2
 * @description Hover over any element to see its CSS classes, selectors, and applied styles. Press Ctrl+Shift+I to toggle inspection mode. Perfect for debugging themes!
 * @version 1.0.1
 * @author Solo Leveling Theme Dev
 */

module.exports = class ElementInspector2 {
  start() {
    this.inspectionActive = false;
    this.overlay = null;
    this.infoBox = null;
    this.lastTarget = null;
    console.log('[ElementInspector2] Plugin started');
    this.createOverlay();
    this.addKeyboardListener();
    BdApi.UI.showToast('ElementInspector2: Press Ctrl+Shift+I to toggle', { type: 'info' });
  }

  stop() {
    console.log('[ElementInspector2] Plugin stopped');
    this.removeOverlay();
    this.removeKeyboardListener();
  }

  createOverlay() {
    // Create info box that will show element details
    this.infoBox = document.createElement('div');
    this.infoBox.id = 'element-inspector-info';
    this.infoBox.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(15, 15, 26, 0.98);
            border: 2px solid #8b5cf6;
            border-radius: 8px;
            padding: 15px;
            color: #e0d0ff;
            font-family: 'JetBrains Mono', 'Courier New', monospace;
            font-size: 12px;
            z-index: 9999999;
            max-width: 500px;
            max-height: 80vh;
            overflow: auto;
            box-shadow: 0 0 20px rgba(139, 92, 246, 0.7);
            display: none;
            pointer-events: auto;
            resize: both;
        `;
    // Add a drag handle for moving the info box
    this.dragHandle = document.createElement('div');
    this.dragHandle.textContent = '⇕ Drag / Resize';
    this.dragHandle.style.cssText = `
            cursor: move;
            user-select: none;
            padding: 6px 8px;
            margin: -5px -5px 8px -5px;
            background: rgba(139, 92, 246, 0.16);
            border-radius: 6px;
            text-align: center;
            font-weight: bold;
            color: #e0d0ff;
        `;
    this.infoBox.appendChild(this.dragHandle);
    document.body.appendChild(this.infoBox);
    this.enableDragAndResize();

    // Create highlight overlay
    this.overlay = document.createElement('div');
    this.overlay.id = 'element-inspector-overlay';
    this.overlay.style.cssText = `
            position: fixed;
            pointer-events: none;
            border: 2px solid #c026d3;
            background: rgba(192, 38, 211, 0.1);
            z-index: 9999998;
            display: none;
            box-shadow: 0 0 15px rgba(192, 38, 211, 0.8);
        `;
    document.body.appendChild(this.overlay);
  }

  removeOverlay() {
    if (this.infoBox) {
      this.infoBox.remove();
      this.infoBox = null;
    }
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('click', this.handleClick);
    if (this.dragMouseMove) {
      document.removeEventListener('mousemove', this.dragMouseMove);
    }
    if (this.dragMouseUp) {
      document.removeEventListener('mouseup', this.dragMouseUp);
    }
  }

  addKeyboardListener() {
    this.keyHandler = (e) => {
      // Ctrl+Shift+I to toggle
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        this.toggleInspection();
      }
      // Ctrl+Shift+H to freeze current hover target
      if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        this.freezeInspection();
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  removeKeyboardListener() {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
    }
  }

  enableDragAndResize() {
    // Convert right positioning to left for dragging
    const rect = this.infoBox.getBoundingClientRect();
    this.infoBox.style.left = `${rect.left}px`;
    this.infoBox.style.top = `${rect.top}px`;
    this.infoBox.style.right = 'auto';

    this.dragMouseMove = (e) => {
      if (!this.dragging) return;
      const newLeft = e.clientX - this.dragOffsetX;
      const newTop = e.clientY - this.dragOffsetY;
      this.infoBox.style.left = `${Math.max(0, newLeft)}px`;
      this.infoBox.style.top = `${Math.max(0, newTop)}px`;
    };

    this.dragMouseUp = () => {
      this.dragging = false;
      document.removeEventListener('mousemove', this.dragMouseMove);
      document.removeEventListener('mouseup', this.dragMouseUp);
    };

    this.dragHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const boxRect = this.infoBox.getBoundingClientRect();
      this.dragging = true;
      this.dragOffsetX = e.clientX - boxRect.left;
      this.dragOffsetY = e.clientY - boxRect.top;
      document.addEventListener('mousemove', this.dragMouseMove);
      document.addEventListener('mouseup', this.dragMouseUp);
    });
  }

  toggleInspection() {
    this.inspectionActive = !this.inspectionActive;

    if (this.inspectionActive) {
      BdApi.UI.showToast(
        'ElementInspector2: ACTIVE - Hover over elements (Ctrl+Shift+H to freeze)',
        { type: 'success' }
      );
      this.infoBox.style.display = 'block';
      this.overlay.style.display = 'block';

      this.handleMouseMove = this.onMouseMove.bind(this);
      this.handleClick = this.onClick.bind(this);

      document.addEventListener('mousemove', this.handleMouseMove, true);
      document.addEventListener('click', this.handleClick, true);
    } else {
      BdApi.UI.showToast('ElementInspector2: INACTIVE', { type: 'info' });
      this.infoBox.style.display = 'none';
      this.overlay.style.display = 'none';

      document.removeEventListener('mousemove', this.handleMouseMove, true);
      document.removeEventListener('click', this.handleClick, true);
    }
  }

  freezeInspection() {
    if (!this.inspectionActive || !this.lastTarget) {
      BdApi.UI.showToast('ElementInspector2: Nothing to freeze! Activate and hover first.', {
        type: 'error',
      });
      return;
    }

    // Stop tracking mouse movement
    document.removeEventListener('mousemove', this.handleMouseMove, true);

    // Keep the info box visible and frozen
    BdApi.UI.showToast('ElementInspector2: FROZEN - Info box will stay visible', {
      type: 'success',
    });

    // Update info box title to show it's frozen
    const frozenNotice = document.createElement('div');
    frozenNotice.style.cssText =
      'color: #00ff88; font-weight: bold; margin-bottom: 10px; padding: 5px; background: rgba(0, 255, 136, 0.1); border-radius: 4px;';
    frozenNotice.textContent = '❄️ FROZEN - Press Ctrl+Shift+I to unfreeze';
    this.infoBox.insertBefore(frozenNotice, this.infoBox.firstChild);
  }

  onMouseMove(e) {
    if (!this.inspectionActive) return;

    const target = e.target;
    if (target === this.infoBox || target === this.overlay) return;

    this.lastTarget = target;

    // Update overlay position
    const rect = target.getBoundingClientRect();
    this.overlay.style.left = rect.left + 'px';
    this.overlay.style.top = rect.top + 'px';
    this.overlay.style.width = rect.width + 'px';
    this.overlay.style.height = rect.height + 'px';

    // Get element info
    this.updateInfoBox(target);
  }

  onClick(e) {
    if (!this.inspectionActive) return;
    e.preventDefault();
    e.stopPropagation();

    // Copy selector to clipboard
    const selector = this.generateSelector(this.lastTarget);
    navigator.clipboard.writeText(selector);
    BdApi.UI.showToast('Selector copied to clipboard!', { type: 'success' });
  }

  updateInfoBox(element) {
    const classes = Array.from(element.classList);
    const classString = classes.join('.');
    const id = element.id;
    const tag = element.tagName.toLowerCase();
    const computedStyle = window.getComputedStyle(element);

    // Get all relevant CSS properties
    const relevantProps = {
      'text-shadow': computedStyle.textShadow,
      'box-shadow': computedStyle.boxShadow,
      filter: computedStyle.filter,
      '-webkit-filter': computedStyle.webkitFilter,
      '-webkit-text-stroke': computedStyle.webkitTextStroke,
      '-webkit-text-stroke-width': computedStyle.webkitTextStrokeWidth,
      '-webkit-text-stroke-color': computedStyle.webkitTextStrokeColor,
      '-webkit-text-fill-color': computedStyle.webkitTextFillColor,
      outline: computedStyle.outline,
      'backdrop-filter': computedStyle.backdropFilter,
      background: computedStyle.background,
      'background-image': computedStyle.backgroundImage,
      color: computedStyle.color,
      opacity: computedStyle.opacity,
      'mix-blend-mode': computedStyle.mixBlendMode,
      isolation: computedStyle.isolation,
      'text-rendering': computedStyle.textRendering,
      'paint-order': computedStyle.paintOrder,
    };

    // Check parent elements for filters
    const parentFilters = [];
    let parent = element.parentElement;
    let depth = 0;
    while (parent && depth < 3) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.filter && parentStyle.filter !== 'none') {
        parentFilters.push(`Parent ${depth + 1}: ${parentStyle.filter}`);
      }
      if (parentStyle.backdropFilter && parentStyle.backdropFilter !== 'none') {
        parentFilters.push(`Parent ${depth + 1} backdrop: ${parentStyle.backdropFilter}`);
      }
      parent = parent.parentElement;
      depth++;
    }

    // Generate selector
    const selector = this.generateSelector(element);

    // Build HTML content
    let html = `
            <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #8b5cf6;">
                <div style="color: #c026d3; font-weight: bold; margin-bottom: 5px;">🎯 ELEMENT INFO</div>
                <div><strong>Tag:</strong> &lt;${tag}&gt;</div>
                ${id ? `<div><strong>ID:</strong> #${id}</div>` : ''}
                ${classes.length > 0 ? `<div><strong>Classes:</strong> .${classString}</div>` : ''}
                ${
                  classes.length > 0
                    ? `<div style="margin-top: 5px;"><strong>Individual Classes:</strong></div>`
                    : ''
                }
                ${classes
                  .map((cls) => `<div style="margin-left: 10px; font-size: 11px;">• ${cls}</div>`)
                  .join('')}
            </div>

            <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #8b5cf6;">
                <div style="color: #c026d3; font-weight: bold; margin-bottom: 5px;">📋 SELECTOR (Click to copy)</div>
                <div style="background: rgba(139, 92, 246, 0.2); padding: 5px; border-radius: 4px; word-break: break-all;">
                    ${selector}
                </div>
            </div>

            <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #8b5cf6;">
                <div style="color: #c026d3; font-weight: bold; margin-bottom: 5px;">🎨 GLOW-RELATED STYLES</div>
        `;

    for (const [prop, value] of Object.entries(relevantProps)) {
      const hasValue = value && value !== 'none' && value !== 'normal' && value !== 'auto';
      const color = hasValue ? '#00ff88' : '#666';
      html += `<div style="color: ${color};"><strong>${prop}:</strong> ${value}</div>`;
    }

    html += `</div>`;

    // Show parent elements
    html += `<div style="margin-bottom: 10px;">
            <div style="color: #c026d3; font-weight: bold; margin-bottom: 5px;">👪 PARENT CHAIN</div>
        `;

    let parentEl = element.parentElement;
    let parentDepth = 0;
    while (parentEl && parentDepth < 5) {
      const parentClasses = Array.from(parentEl.classList).join('.');
      const parentTag = parentEl.tagName.toLowerCase();
      const parentId = parentEl.id;
      html += `<div style="margin-left: ${parentDepth * 15}px; opacity: ${1 - parentDepth * 0.15};">
                ${parentTag}${parentId ? '#' + parentId : ''}${
        parentClasses ? '.' + parentClasses : ''
      }
            </div>`;
      parentEl = parentEl.parentElement;
      parentDepth++;
    }

    html += `</div>`;

    this.infoBox.innerHTML = html;
  }

  generateSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }

    const classes = Array.from(element.classList);
    if (classes.length > 0) {
      return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
    }

    // Fallback to tag + nth-child
    const parent = element.parentElement;
    if (parent) {
      const index = Array.from(parent.children).indexOf(element) + 1;
      return `${this.generateSelector(
        parent
      )} > ${element.tagName.toLowerCase()}:nth-child(${index})`;
    }

    return element.tagName.toLowerCase();
  }
};
