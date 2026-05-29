/**
 * Window-hosted DOM event hubs — shared across every plugin.
 *
 * esbuild bundles src/shared/* into each plugin separately, so module-level
 * state is NOT shared cross-plugin; only globals are. This hosts the hub on
 * window.__SL_DomBus (same first-wins pattern as shared/event-bus.js) so the
 * whole suite shares:
 *   - ONE document 'keydown' listener per phase (capture + bubble), fanned out
 *     to registered handlers. Phase is preserved per registration so a handler
 *     that needs capture-phase (to beat Discord's own handler / stopPropagation)
 *     still gets it.
 *   - ONE rAF-coalesced passive 'resize' listener, fanned out to handlers.
 *
 * Replaces ~12 per-plugin keydown listeners and ~6 resize listeners.
 *
 * NOTE: only migrate PERSISTENT, document/window-level listeners here. Leave
 * element-scoped listeners (dialog/icon.addEventListener) and short-lived
 * transition-scoped listeners on their own element — they are intentionally
 * narrow and are torn down with their element.
 */
function _getDomBus() {
  if (window.__SL_DomBus) return window.__SL_DomBus;

  const bus = {
    _kdCapture: new Set(),
    _kdBubble: new Set(),
    _onKdCapture: null,
    _onKdBubble: null,
    _resize: new Set(),
    _onResize: null,
    _resizeRaf: false,

    addKeydown(fn, capture) {
      const set = capture ? this._kdCapture : this._kdBubble;
      set.add(fn);
      if (capture && !this._onKdCapture) {
        this._onKdCapture = (e) => { for (const h of this._kdCapture) { try { h(e); } catch (_) {} } };
        document.addEventListener('keydown', this._onKdCapture, true);
      } else if (!capture && !this._onKdBubble) {
        this._onKdBubble = (e) => { for (const h of this._kdBubble) { try { h(e); } catch (_) {} } };
        document.addEventListener('keydown', this._onKdBubble, false);
      }
      return () => {
        set.delete(fn);
        if (capture && this._onKdCapture && this._kdCapture.size === 0) {
          document.removeEventListener('keydown', this._onKdCapture, true);
          this._onKdCapture = null;
        } else if (!capture && this._onKdBubble && this._kdBubble.size === 0) {
          document.removeEventListener('keydown', this._onKdBubble, false);
          this._onKdBubble = null;
        }
      };
    },

    addResize(fn) {
      this._resize.add(fn);
      if (!this._onResize) {
        // rAF-coalesce: multiple resize events within a frame fire handlers once.
        this._onResize = () => {
          if (this._resizeRaf) return;
          this._resizeRaf = true;
          requestAnimationFrame(() => {
            this._resizeRaf = false;
            for (const h of this._resize) { try { h(); } catch (_) {} }
          });
        };
        window.addEventListener('resize', this._onResize, { passive: true });
      }
      return () => {
        this._resize.delete(fn);
        if (this._onResize && this._resize.size === 0) {
          window.removeEventListener('resize', this._onResize);
          this._onResize = null;
        }
      };
    },
  };

  window.__SL_DomBus = bus;
  return bus;
}

/**
 * Register a global keydown handler on the shared listener.
 * @param {(e: KeyboardEvent) => void} handler
 * @param {{capture?: boolean}} [opts] default capture:true (matches the majority
 *   of existing consumers — pass {capture:false} to preserve a bubble-phase handler)
 * @returns {() => void} unsubscribe
 */
function onKeydown(handler, opts) {
  if (typeof handler !== 'function') return () => {};
  const capture = !(opts && opts.capture === false);
  return _getDomBus().addKeydown(handler, capture);
}

/**
 * Register a window resize handler on the shared rAF-coalesced listener.
 * Handler is called with no args, at most once per animation frame.
 * @param {() => void} handler
 * @returns {() => void} unsubscribe
 */
function onResize(handler) {
  if (typeof handler !== 'function') return () => {};
  return _getDomBus().addResize(handler);
}

module.exports = { onKeydown, onResize };
