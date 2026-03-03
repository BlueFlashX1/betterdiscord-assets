/**
 * @name HotkeysTest
 * @author Matthew Thompson
 * @description A new BetterDiscord plugin
 * @version 1.0.0
 */

/**
 * TABLE OF CONTENTS
 * 1) Lifecycle
 * 2) Keydown Routing
 * 3) Action Handlers
 */

module.exports = class HotkeysTest {
  constructor() {
    this.pluginId = 'HotkeysTest';
    this.version = '1.0.0';
    this._controller = null;

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

  // =========================================================================
  // 1) LIFECYCLE
  // =========================================================================
  start() {
    if (this._controller && !this._controller.signal.aborted) {
      this._controller.abort();
    }
    this._controller = new AbortController();
    document.removeEventListener('keydown', this.onKeyDown);

    document.addEventListener('keydown', this.onKeyDown, {
      signal: this._controller.signal,
    });
    BdApi.UI.showToast(this.pluginId + ' Hotkeys Active', { type: 'success' });
  }

  stop() {
    document.removeEventListener('keydown', this.onKeyDown);
    if (this._controller && !this._controller.signal.aborted) {
      this._controller.abort();
    }
    this._controller = null;
    BdApi.UI.showToast(this.pluginId + ' Stopped', { type: 'info' });
  }

  // =========================================================================
  // 2) KEYDOWN ROUTER
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
    if (this.isTextInputFocused(document.activeElement)) {
      return;
    }

    for (const hotkey of this.hotkeys) {
      if (this.matchesHotkey(event, hotkey)) {
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
  // HOTKEY MATCH HELPERS
  // =========================================================================
  matchesHotkey(event, hotkey) {
    const primaryRequired = Boolean(hotkey.ctrl || hotkey.meta);
    const primaryPressed = Boolean(event.ctrlKey || event.metaKey);

    if (event.code !== hotkey.code) return false;
    if (primaryRequired !== primaryPressed) return false;
    if (hotkey.shift !== event.shiftKey) return false;
    if (hotkey.alt !== event.altKey) return false;
    return true;
  }

  isTextInputFocused(activeElement) {
    if (!activeElement) return false;
    if (activeElement.isContentEditable) return true;

    const tag = activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (activeElement.closest && activeElement.closest('[role="textbox"]')) return true;

    return false;
  }

  // =========================================================================
  // 3) HOTKEY ACTION HANDLERS
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
