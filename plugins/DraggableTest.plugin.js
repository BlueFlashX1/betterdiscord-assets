/**
 * @name DraggableTest
 * @author Matthew Thompson
 * @description A new BetterDiscord plugin
 * @version 1.0.0
 */

module.exports = class DraggableTest {
  constructor() {
    this.pluginId = 'DraggableTest';
    this.version = '1.0.0';
    this._cssId = this.pluginId + '-css';
    this._containerId = this.pluginId + '-widget';

    // State machine bindings
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);

    // DND State
    this.isDragging = false;
    this.shiftX = 0;
    this.shiftY = 0;
  }

  start() {
    this.injectCSS();
    this.injectWidget();
    BdApi.UI.showToast(this.pluginId + ' Draggable Widget Active', {
      type: 'success',
    });
  }

  stop() {
    // Cleanup DOM
    BdApi.DOM.removeStyle(this._cssId);
    const widget = document.getElementById(this._containerId);
    if (widget) widget.remove();

    // Cleanup global listeners (failsafe)
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);

    BdApi.UI.showToast(this.pluginId + ' Stopped', { type: 'info' });
  }

  injectCSS() {
    const css = `
      #${this._containerId} {
        position: absolute;
        top: 20px;
        left: 20px;
        width: 300px;
        height: 200px;
        background: var(--background-secondary, #2f3136);
        border: 1px solid var(--border-subtle, #202225);
        border-radius: 8px;
        box-shadow: var(--elevation-high);
        color: var(--text-normal, #dcddde);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      #${this._containerId} .widget-header {
        padding: 10px;
        background: var(--background-tertiary, #202225);
        font-weight: bold;
        cursor: grab;
        user-select: none;
        border-bottom: 1px solid var(--border-subtle, rgba(0,0,0,0.2));
      }

      #${this._containerId}.dragging .widget-header {
        cursor: grabbing;
      }

      #${this._containerId} .widget-body {
        padding: 15px;
        flex: 1;
      }
    `;
    BdApi.DOM.addStyle(this._cssId, css);
  }

  injectWidget() {
    const widget = document.createElement('div');
    widget.id = this._containerId;

    widget.innerHTML = `
      <div class="widget-header">${this.pluginId}</div>
      <div class="widget-body">
        <p>Drag me by the header!</p>
        <!-- AI HYDRATION ZONE: Add custom UI/React roots here -->
      </div>
    `;

    // Prevent default browser drag behaviors completely
    widget.ondragstart = () => false;

    // Attach mousedown to the header (drag handle)
    const header = widget.querySelector('.widget-header');
    header.addEventListener('mousedown', this.onMouseDown);

    document.body.appendChild(widget);
  }

  onMouseDown(event) {
    if (event.button !== 0) return; // Only left-click

    const widget = document.getElementById(this._containerId);
    if (!widget) return;

    this.isDragging = true;
    widget.classList.add('dragging');

    // Calculate initial shift to prevent jumping to center
    const rect = widget.getBoundingClientRect();
    this.shiftX = event.clientX - rect.left;
    this.shiftY = event.clientY - rect.top;

    // Elevate z-index while dragging
    widget.style.zIndex = 10000;

    // Attach high-frequency events to DOCUMENT, not the widget,
    // so fast mouse flicks don't break the drag connection.
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  onMouseMove(event) {
    if (!this.isDragging) return;

    const widget = document.getElementById(this._containerId);
    if (!widget) return;

    // Position based on current mouse minus the initial grip shift
    let newX = event.clientX - this.shiftX;
    let newY = event.clientY - this.shiftY;

    // Optional bounds checking could go here to keep it on screen

    widget.style.left = newX + 'px';
    widget.style.top = newY + 'px';
  }

  onMouseUp() {
    this.isDragging = false;
    const widget = document.getElementById(this._containerId);
    if (widget) {
      widget.classList.remove('dragging');
      // Reset z-index
      widget.style.zIndex = 1000;
    }

    // Detach document listeners when not dragging
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }
};
