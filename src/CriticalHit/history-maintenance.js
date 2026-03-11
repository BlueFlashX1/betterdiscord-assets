const C = require('./constants');

module.exports = {
  // --------------------------------------------------------------------------
  // Cleanup & Memory Management
  // --------------------------------------------------------------------------

  /**
   * Calculates excess messages to remove for LRU cleanup
   * @returns {number} Number of messages to remove
   */
  _calculateExcessProcessedMessages() {
    return this.processedMessages.size > this.maxProcessedMessages
      ? this.processedMessages.size - this.maxProcessedMessages
      : 0;
  },

  /**
   * Removes oldest processed messages from Set and order array
   * @param {number} excess - Number of messages to remove
   */
  _removeOldestProcessedMessages(excess) {
    const toRemove = this.processedMessagesOrder.slice(0, excess);
    toRemove.forEach((messageId) => {
      this.processedMessages.delete(messageId);
    });
    this.processedMessagesOrder = this.processedMessagesOrder.slice(excess);
  },

  /**
   * Clean up processedMessages Set when it exceeds max size (LRU-style)
   * Removes oldest entries to prevent unbounded growth
   */
  cleanupProcessedMessages() {
    const excess = this._calculateExcessProcessedMessages();
    if (excess === 0) return;

    this.debugLog('CLEANUP_PROCESSED', `Cleaning up ${excess} old processed messages`, {
      before: this.processedMessages.size,
      after: this.maxProcessedMessages,
    });

    this._removeOldestProcessedMessages(excess);
  },

  /**
   * Clears session tracking data (preserves history for restoration)
   * Used when switching channels or restarting
   */
  clearSessionTracking() {
    this.critMessages.clear();
    this.processedMessages.clear();
    this.processedMessagesOrder = [];
  },

  /**
   * Atomically check and add message ID to processedMessages (fixes race condition)
   * Returns true if message was added (not already present), false if already processed
   */
  markAsProcessed(messageId) {
    if (!messageId) return false;

    // Atomic check-and-add: if already present, return false immediately
    if (this.processedMessages.has(messageId)) {
      return false;
    }

    // Add to Set and track order for LRU cleanup
    this.processedMessages.add(messageId);
    this.processedMessagesOrder.push(messageId);

    // Cleanup if needed
    this.processedMessages.size > this.maxProcessedMessages && this.cleanupProcessedMessages();

    return true;
  },

  // --------------------------------------------------------------------------
  // Periodic Cleanup
  // --------------------------------------------------------------------------

  /**
   * Executes periodic cleanup tasks
   */
  _executePeriodicCleanup() {
    try {
      this.debugLog('PERIODIC_CLEANUP', 'Running periodic history cleanup');
      const retentionDays =
        this.settings.historyRetentionDays || C.DEFAULT_HISTORY_RETENTION_DAYS;
      this.settings.autoCleanupHistory && this.cleanupOldHistory(retentionDays);
      this.cleanupProcessedMessages();
    } catch (error) {
      this.debugError('PERIODIC_CLEANUP', error);
    }
  },

  /**
   * Start periodic history cleanup (runs every 30 minutes)
   */
  startPeriodicCleanup() {
    // Clear any existing interval
    this.historyCleanupInterval &&
      (this._trackedIntervals.delete(this.historyCleanupInterval),
      clearInterval(this.historyCleanupInterval),
      (this.historyCleanupInterval = null));

    // Run cleanup at configured interval
    this.historyCleanupInterval = this._setTrackedInterval(
      () => this._executePeriodicCleanup(),
      C.PERIODIC_CLEANUP_INTERVAL_MS
    );

    this.debugLog('PERIODIC_CLEANUP', 'Started periodic cleanup interval', {
      intervalMinutes: C.PERIODIC_CLEANUP_INTERVAL_MS / (60 * 1000),
    });
  },

  // --------------------------------------------------------------------------
  // History Cleanup
  // --------------------------------------------------------------------------

  /**
   * Calculates cutoff timestamp for history cleanup
   * @param {number} daysToKeep - Number of days to keep
   * @returns {number} Cutoff timestamp in milliseconds
   */
  _calculateHistoryCutoffTime(daysToKeep) {
    return Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  },

  /**
   * Filters history entries by cutoff time
   * @param {number} cutoffTime - Cutoff timestamp
   * @returns {Array} Filtered history entries
   */
  _filterHistoryByCutoff(cutoffTime) {
    return this.messageHistory.filter((entry) => entry.timestamp > cutoffTime);
  },

  /**
   * Calculates cleanup statistics
   * @param {number} initialLength - Initial history length
   * @param {number} initialCrits - Initial crit count
   * @returns {Object} Cleanup stats
   */
  _calculateCleanupStats(initialLength, initialCrits) {
    const removed = initialLength - this.messageHistory.length;
    const removedCrits = initialCrits - this.getCritHistory().length;
    return { removed, removedCrits };
  },

  /**
   * Removes history entries older than specified days
   * @param {number} daysToKeep - Number of days to keep (default: 30)
   */
  cleanupOldHistory(daysToKeep = C.DEFAULT_HISTORY_RETENTION_DAYS) {
    const cutoffTime = this._calculateHistoryCutoffTime(daysToKeep);
    const initialLength = this.messageHistory.length;
    const initialCrits = this.messageHistory.filter((e) => e.isCrit).length;

    this.messageHistory = this._filterHistoryByCutoff(cutoffTime);
    this._cachedCritHistory = null;

    const { removed, removedCrits } = this._calculateCleanupStats(initialLength, initialCrits);

    if (removed > 0) {
      this.debugLog('CLEANUP_HISTORY', 'Cleaned up old history entries', {
        removed,
        removedCrits,
        remaining: this.messageHistory.length,
        daysToKeep,
      });
      this.debugLog(
        'CLEANUP_HISTORY',
        `Cleaned up ${removed} old history entries (${removedCrits} crits)`
      );
      this._throttledSaveHistory(false);
      this.updateStats();
    }
  },

  // --------------------------------------------------------------------------
  // Statistics Management
  // --------------------------------------------------------------------------

  /**
   * Calculates crit rate from history
   * @param {number} totalCrits - Total crit count
   * @param {number} totalMessages - Total message count
   * @returns {number} Crit rate percentage
   */
  _calculateCritRate(totalCrits, totalMessages) {
    return totalMessages > 0 ? (totalCrits / totalMessages) * 100 : 0;
  },

  /**
   * Updates statistics from message history
   */
  updateStats() {
    // Check cache first
    const now = Date.now();
    if (
      this._cache.stats &&
      this._cache.statsTime &&
      now - this._cache.statsTime < this._cache.statsTTL
    ) {
      // Update stats object with cached values
      this.stats = { ...this._cache.stats };
      return;
    }

    const totalCrits = this.getCritHistory().length;
    const totalMessages = this.messageHistory.length;
    const critRate = this._calculateCritRate(totalCrits, totalMessages);

    const stats = {
      totalCrits,
      totalMessages,
      critRate,
      lastUpdated: now,
    };

    // Update stats and cache
    this.stats = stats;
    this._cache.stats = stats;
    this._cache.statsTime = now;
  },
};
