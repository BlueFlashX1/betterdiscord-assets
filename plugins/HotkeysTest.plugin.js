/**
 * @name HotkeysTest
 * @author Matthew Thompson
 * @description A new BetterDiscord plugin
 * @version 1.0.0
 */

module.exports = class HotkeysTest {
  constructor() {
    this.pluginId = 'HotkeysTest';
    this.version = '1.0.0';
    this._controller = new AbortController();

    // Bind the keydown handler
    this.onKeyDown = this.onKeyDown.bind(this);

    // --- HOTKEY REGISTRY ---
    // Uses event.code (physical key position) instead of event.key (character)
    // so hotkeys work correctly across ALL keyboard layouts (QWERTY, AZERTY, QWERTZ).
    // Reference: https://javascript.info/keyboard-events
    //
    // Format: { code, ctrl, shift, alt, meta, action }
    this.hotkeys = [
      {
        code: 'KeyS',
        ctrl: true,
        shift: false,
        alt: false,
        meta: false,
        action: 'onSave',
      },
      {
        code: 'KeyK',
        ctrl: true,
        shift: true,
        alt: false,
        meta: false,
        action: 'onTogglePanel',
      },
      {
        code: 'Escape',
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
        action: 'onEscape',
      },
    ];
  }

  start() {
    document.addEventListener('keydown', this.onKeyDown, {
      signal: this._controller.signal,
    });
    BdApi.UI.showToast(this.pluginId + ' Hotkeys Active', { type: 'success' });
  }

  stop() {
    this._controller.abort();
    BdApi.UI.showToast(this.pluginId + ' Stopped', { type: 'info' });
  }

  // =========================================================================
  // KEYDOWN ROUTER
  // Reference: https://javascript.info/keyboard-events
  //
  // Key design decisions from the tutorial:
  // 1. Use event.code (not event.key) for layout-safe physical key matching
  // 2. Check modifier keys (ctrlKey, shiftKey, altKey, metaKey) explicitly
  // 3. Use metaKey for macOS Cmd support
  // 4. Ignore auto-repeat events (event.repeat) to prevent rapid-fire
  // =========================================================================
  onKeyDown(event) {
    // Skip auto-repeat (holding a key down)
    if (event.repeat) return;

    // Don't intercept keyboard input when the user is typing in a text field
    const activeTag = document.activeElement?.tagName;
    if (
      activeTag === 'INPUT' ||
      activeTag === 'TEXTAREA' ||
      document.activeElement?.isContentEditable
    ) {
      return;
    }

    for (const hotkey of this.hotkeys) {
      const ctrlMatch = hotkey.ctrl === (event.ctrlKey || event.metaKey);
      const shiftMatch = hotkey.shift === event.shiftKey;
      const altMatch = hotkey.alt === event.altKey;

      if (event.code === hotkey.code && ctrlMatch && shiftMatch && altMatch) {
        event.preventDefault();
        event.stopPropagation();

        if (typeof this[hotkey.action] === 'function') {
          this[hotkey.action](event);
        }
        return;
      }
    }
  }

  // =========================================================================
  // HOTKEY ACTION HANDLERS
  // =========================================================================

  // Ctrl+S
  onSave(event) {
    // --- AI HYDRATION ZONE ---
    BdApi.UI.showToast(this.pluginId + ': Save triggered', { type: 'success' });
    // -------------------------
  }

  // Ctrl+Shift+K
  onTogglePanel(event) {
    // --- AI HYDRATION ZONE ---
    BdApi.UI.showToast(this.pluginId + ': Toggle Panel', { type: 'info' });
    // -------------------------
  }

  // Escape
  onEscape(event) {
    // --- AI HYDRATION ZONE ---
    BdApi.UI.showToast(this.pluginId + ': Escape pressed', { type: 'info' });
    // -------------------------
  }
};
