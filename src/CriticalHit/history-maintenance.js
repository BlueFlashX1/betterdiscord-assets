const C = require('./constants');

module.exports = {
  _calculateExcessProcessedMessages() {
    return this.processedMessages.size > this.maxProcessedMessages
      ? this.processedMessages.size - this.maxProcessedMessages
      : 0;
  },

  _removeOldestProcessedMessages(excess) {
    const toRemove = this.processedMessagesOrder.slice(0, excess);
    toRemove.forEach((messageId) => {
      this.processedMessages.delete(messageId);
    });
    this.processedMessagesOrder = this.processedMessagesOrder.slice(excess);
  },

  /** LRU-style cleanup of processedMessages when it exceeds max size. */
  cleanupProcessedMessages() {
    const excess = this._calculateExcessProcessedMessages();
    if (excess === 0) return;

    this.debugLog('CLEANUP_PROCESSED', `Cleaning up ${excess} old processed messages`, {
      before: this.processedMessages.size,
      after: this.maxProcessedMessages,
    });

    this._removeOldestProcessedMessages(excess);
  },

  clearSessionTracking() {
    this.critMessages.clear();
    this.processedMessages.clear();
    this.processedMessagesOrder = [];
  },

  /**
   * PERF: Prune critMessages of disconnected DOM elements to prevent memory leak.
   * Discord's virtualised message list removes nodes from the DOM — we must release refs.
   */
  pruneCritMessages() {
    for (const el of this.critMessages) {
      if (!el.isConnected) this.critMessages.delete(el);
    }
  },

  /** Atomically check-and-add messageId to processedMessages. Returns false if already present. */
  markAsProcessed(messageId) {
    if (!messageId) return false;

    if (this.processedMessages.has(messageId)) {
      return false;
    }

    this.processedMessages.add(messageId);
    this.processedMessagesOrder.push(messageId);

    this.processedMessages.size > this.maxProcessedMessages && this.cleanupProcessedMessages();

    return true;
  },

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

  startPeriodicCleanup() {
    this.historyCleanupInterval &&
      (this._trackedIntervals.delete(this.historyCleanupInterval),
      clearInterval(this.historyCleanupInterval),
      (this.historyCleanupInterval = null));

    this.historyCleanupInterval = this._setTrackedInterval(
      () => this._executePeriodicCleanup(),
      C.PERIODIC_CLEANUP_INTERVAL_MS
    );

    this.debugLog('PERIODIC_CLEANUP', 'Started periodic cleanup interval', {
      intervalMinutes: C.PERIODIC_CLEANUP_INTERVAL_MS / (60 * 1000),
    });
  },

  _calculateHistoryCutoffTime(daysToKeep) {
    return Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  },

  _filterHistoryByCutoff(cutoffTime) {
    return this.messageHistory.filter((entry) => entry.timestamp > cutoffTime);
  },

  _calculateCleanupStats(initialLength, initialCrits) {
    const removed = initialLength - this.messageHistory.length;
    const removedCrits = initialCrits - this.getCritHistory().length;
    return { removed, removedCrits };
  },

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

  _calculateCritRate(totalCrits, totalMessages) {
    return totalMessages > 0 ? (totalCrits / totalMessages) * 100 : 0;
  },

  updateStats() {
    const now = Date.now();
    if (
      this._cache.stats &&
      this._cache.statsTime &&
      now - this._cache.statsTime < this._cache.statsTTL
    ) {
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

    this.stats = stats;
    this._cache.stats = stats;
    this._cache.statsTime = now;
  },
};
