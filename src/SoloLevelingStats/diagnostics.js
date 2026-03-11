module.exports = {
  debugLog(operation, message, data = null) {
    // UNIFIED DEBUG SYSTEM: Check settings.debugMode instead of this.debug.enabled
    if (!this.settings?.debugMode) return;
  
    // Check if this is a frequent operation
    const isFrequent = this.debug.frequentOperations.has(operation);
  
    if (isFrequent && !this.debug.verbose) {
      // Throttle frequent operations - only log once per throttleInterval
      const now = Date.now();
      const lastLogTime = this.debug.lastLogTimes[operation] || 0;
  
      if (now - lastLogTime < this.debug.throttleInterval) {
        // Skip logging, but still track count
        this.debug.operationCounts[operation] = (this.debug.operationCounts[operation] || 0) + 1;
        return;
      }
  
      // Update last log time
      this.debug.lastLogTimes[operation] = now;
    }
  
    console.warn(`[SoloLevelingStats:${operation}] ${message}`, data || '');
  
    // Track operation counts
    this.debug.operationCounts[operation] = (this.debug.operationCounts[operation] || 0) + 1;
  },

  debugError(operation, error, context = {}) {
    if (!this.debug) this.debug = {};
    if (typeof this.debug.errorCount !== 'number') this.debug.errorCount = 0;
    this.debug.errorCount++;
  
    // Extract error message properly
    let errorMessage = 'Unknown error';
    let errorStack = null;
  
    if (error instanceof Error) {
      errorMessage = error.message || String(error);
      errorStack = error.stack;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      // Try to extract meaningful info from error object
      errorMessage = error.message || error.toString() || JSON.stringify(error).substring(0, 200);
      errorStack = error.stack;
    } else {
      errorMessage = String(error);
    }
  
    this.debug.lastError = {
      operation,
      error: errorMessage,
      stack: errorStack,
      context,
      timestamp: Date.now(),
    };
  
    const timestamp = new Date().toISOString();
    console.error(`[SoloLevelingStats:ERROR:${operation}]`, errorMessage, {
      stack: errorStack,
      context,
      timestamp,
    });
  
    // Also log to debug file
    console.warn(`[SoloLevelingStats:ERROR:${operation}] ${errorMessage}`, context);
  },

  debugConsole(prefix, message, data = {}) {
    // Safe check: Only log if settings exist AND debugMode is explicitly true
    if (this.settings?.debugMode === true) {
      console.log(`${prefix}`, message, data);
    }
  }
};
