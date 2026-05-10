/**
 * CriticalHit — Debug & diagnostic logging methods.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const _frequentOps = new Set([
  'GET_MESSAGE_ID',
  'CHECK_FOR_RESTORATION',
  'RESTORE_CHANNEL_CRITS',
  'CHECK_FOR_CRIT',
  'PROCESS_NODE',
  'MUTATION_OBSERVER',
]);

module.exports = {
  updateDebugMode(enabled) {
    this.settings.debugMode = enabled === true;
    this.debug.enabled = enabled === true;
    this.saveSettings();

    this.debugLog('UPDATE_DEBUG_MODE', `Debug mode ${enabled ? 'enabled' : 'disabled'}`, {
      debugMode: this.settings.debugMode,
      debugEnabled: this.debug.enabled,
    });

    this._toast(`Debug mode ${enabled ? 'enabled' : 'disabled'}`, enabled ? 'warning' : 'info');
  },

  /**
   * Targeted diagnostics for crit-style retention (independent from debugMode).
   * Use this for concrete strip/mismatch events that must be visible in user console.
   * @param {string} operation
   * @param {string} message
   * @param {Object|null} data
   * @param {'info'|'warn'|'error'} level
   */
  diagLog(operation, message, data = null, level = 'info') {
    if (this.settings?.diagnosticLogs !== true) return;
    const now = Date.now();
    const messageId = data?.messageId ? String(data.messageId) : '';
    const key = messageId ? `${operation}:${messageId}` : `${operation}:${message}`;
    const opThrottleMs = operation === 'STYLE_RESTORED' ? 60000 : this._diagLogThrottleMs;
    const lastLogged = this._diagLogThrottle?.get(key) || 0;
    if (now - lastLogged < opThrottleMs) return;
    this._diagLogThrottle?.set(key, now);
    if (this._diagLogThrottle && this._diagLogThrottle.size > 2000) {
      const cleanupCutoff = now - Math.max(opThrottleMs * 2, 120000);
      for (const [throttleKey, ts] of this._diagLogThrottle.entries()) {
        if (ts < cleanupCutoff) this._diagLogThrottle.delete(throttleKey);
      }
    }
    const method =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    const prefix = `[CriticalHit:DIAG:${operation}] ${message}`;
    data ? method(prefix, data) : method(prefix);
  },

  debugLog(operation, message, data = null) {
    if (!this.debug?.enabled) return;

    if (_frequentOps.has(operation)) {
      const now = Date.now();
      if (!this.debug.lastLogTimes) this.debug.lastLogTimes = {};
      const last = this.debug.lastLogTimes[operation] || 0;
      if (last && now - last < 10000) {
        this.debug.operationCounts[operation] = (this.debug.operationCounts[operation] || 0) + 1;
        return;
      }
      this.debug.lastLogTimes[operation] = now;
    }

    if (this.settings?.debugMode === true) {
      console.warn(`[CriticalHit:${operation}] ${message}`, data || '');
    }

    this.debug.operationCounts[operation] = (this.debug.operationCounts[operation] || 0) + 1;
  },

  debugError(operation, error, context = {}) {
    // Stat tracking (gated by debug.enabled to avoid memory growth in
    // production for non-error tracking).
    this.debug?.enabled &&
      (this.debug.errorCount++,
      (this.debug.lastError = {
        operation,
        error: error?.message || error,
        stack: error?.stack,
        context,
        timestamp: Date.now(),
      }));

    // BUG FIX: previously errors were ONLY logged when debugMode was
    // true. `debugMode` defaults to false and gets reset to false on
    // every loadSettings() call, so every `debugError(...)` call across
    // the plugin was silently inert in production — save failures,
    // dispatcher subscribe failures, and webpack init errors all
    // invisible to the user.
    //
    // Errors are by definition important and rare. ALWAYS log them
    // via console.error regardless of debugMode. The verbose
    // `debugLog` (per-operation tracing) stays gated as before.
    const timestamp = new Date().toISOString();
    try {
      console.error(`[CriticalHit:ERROR:${operation}]`, {
        message: error?.message || error,
        stack: error?.stack,
        context,
        timestamp,
      });
    } catch (_) {
      // console.error itself failed (extremely rare). Nothing to do.
    }
  },
};
