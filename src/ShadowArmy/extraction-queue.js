/**
 * ShadowArmy — message listener + queued extraction pacing.
 *
 * Mixin: Object.assign(ShadowArmy.prototype, require('./extraction-queue'))
 */

module.exports = {
  setupMessageListener() {
    if (!this.soloPlugin) {
      this.integrateWithSoloLeveling();
    }
    if (!this.soloPlugin) {
      this.debugLog(
        'MESSAGE_LISTENER',
        'SoloLevelingStats not available, message extraction disabled'
      );
      return;
    }

    const instance = this.soloPlugin.instance || this.soloPlugin;
    if (!instance || !instance.processMessageSent) {
      this.debugLog(
        'MESSAGE_LISTENER',
        'processMessageSent not found, message extraction disabled'
      );
      return;
    }

    if (
      this._messageProcessWrapper &&
      instance.processMessageSent === this._messageProcessWrapper
    ) {
      this.debugLog('MESSAGE_LISTENER', 'processMessageSent already wrapped by ShadowArmy');
      return;
    }

    const currentProcessMessage = instance.processMessageSent;
    if (typeof currentProcessMessage !== 'function') {
      this.debugLog(
        'MESSAGE_LISTENER',
        'processMessageSent is not callable, message extraction disabled'
      );
      return;
    }

    this.originalProcessMessage = currentProcessMessage;

    // Wrap processMessageSent to add extraction logic
    // NOTE: processMessageSent is SYNCHRONOUS in SoloLevelingStats, not async
    const self = this;
    const wrappedProcessMessage = function (messageText) {
      const result = currentProcessMessage.call(this, messageText);

      self.debugLog('MESSAGE_LISTENER', 'Message received, attempting extraction', {
        messageLength: messageText?.length || 0,
        messagePreview: messageText?.substring(0, 30) || 'N/A',
      });
      self.queueMessageExtraction(messageText);

      return result;
    };
    wrappedProcessMessage.__shadowArmyWrapped = true;
    wrappedProcessMessage.__shadowArmyPrevious = currentProcessMessage;

    this._messageProcessWrapper = wrappedProcessMessage;
    instance.processMessageSent = wrappedProcessMessage;

    this.debugLog('MESSAGE_LISTENER', 'Message listener setup complete', {
      hasOriginalFunction: !!this.originalProcessMessage,
      hasInstance: !!instance,
      hasProcessMessageSent: !!instance.processMessageSent,
    });
  },

  getMessageQueueInitialDelayMs() {
    const cfg = this.settings?.extractionConfig || this.defaultSettings.extractionConfig;
    const value = Number(cfg?.messageQueueInitialDelayMs);
    return Number.isFinite(value) ? Math.max(50, value) : 120;
  },

  getMessageQueueIntervalMs() {
    const cfg = this.settings?.extractionConfig || this.defaultSettings.extractionConfig;
    const value = Number(cfg?.messageQueueIntervalMs);
    return Number.isFinite(value) ? Math.max(150, value) : 450;
  },

  getMessageQueueMaxPending() {
    const cfg = this.settings?.extractionConfig || this.defaultSettings.extractionConfig;
    const fallback = Number(cfg?.maxExtractionsPerMinute) || 20;
    const value = Number(cfg?.messageQueueMaxPending);
    return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : Math.max(1, fallback);
  },

  queueMessageExtraction(messageText = '') {
    if (this._isStopped) return;

    const maxPending = this.getMessageQueueMaxPending();
    if ((this._pendingMessageExtractionCount || 0) >= maxPending) {
      this.debugLog('MESSAGE_QUEUE', 'Message extraction queue full, dropping event', {
        maxPending,
      });
      return;
    }

    this._pendingMessageExtractionCount = (this._pendingMessageExtractionCount || 0) + 1;
    this.debugLog('MESSAGE_QUEUE', 'Queued message extraction', {
      pendingQueue: this._pendingMessageExtractionCount,
      messageLength: messageText?.length || 0,
    });

    const initialDelay = this.getMessageQueueInitialDelayMs();
    this.scheduleMessageQueueDrain(initialDelay);
  },

  scheduleMessageQueueDrain(delayMs = 0) {
    if (this._isStopped) return;
    if (this._isProcessingMessageExtractionQueue) return;
    if (this._messageExtractionQueueTimeout) return;
    if ((this._pendingMessageExtractionCount || 0) <= 0) return;

    const safeDelay = Math.max(0, Number(delayMs) || 0);
    const queueTimeoutId = setTimeout(() => {
      this._retryTimeouts?.delete(queueTimeoutId);
      this._messageExtractionQueueTimeout = null;
      this.drainMessageExtractionQueue();
    }, safeDelay);

    this._messageExtractionQueueTimeout = queueTimeoutId;
    this._retryTimeouts?.add(queueTimeoutId);
  },

  drainMessageExtractionQueue() {
    if (this._isStopped) return;
    if (this._isProcessingMessageExtractionQueue) return;

    const pendingCount = this._pendingMessageExtractionCount || 0;
    if (pendingCount <= 0) return;

    this._isProcessingMessageExtractionQueue = true;
    this._pendingMessageExtractionCount = pendingCount - 1;

    this.attemptShadowExtraction()
      .then((shadow) => {
        if (shadow) {
          const shadowId = this.getCacheKey(shadow);
          this.debugLog('MESSAGE_EXTRACTION', 'SUCCESS: Shadow extracted from message', {
            rank: shadow.rank,
            role: shadow.role,
            id: shadowId,
            pendingQueue: this._pendingMessageExtractionCount || 0,
          });
        } else {
          this.debugLog('MESSAGE_EXTRACTION', 'No shadow extracted (returned null)');
        }
      })
      .catch((error) => {
        this.debugError('MESSAGE_EXTRACTION', 'Error during message extraction', error);
      })
      .finally(() => {
        this._isProcessingMessageExtractionQueue = false;
        if (this._isStopped) return;

        if ((this._pendingMessageExtractionCount || 0) > 0) {
          this.scheduleMessageQueueDrain(this.getMessageQueueIntervalMs());
        }
      });
  },

  removeMessageListener() {
    if (this.messageUnsubscribe) {
      try {
        this.messageUnsubscribe();
      } catch (error) {
        this.debugError('MESSAGE_LISTENER', 'Error unsubscribing message listener', error);
      }
      this.messageUnsubscribe = null;
    }
    if (this.soloPlugin && this.originalProcessMessage) {
      const instance = this.soloPlugin.instance || this.soloPlugin;
      if (
        instance &&
        instance.processMessageSent &&
        (!this._messageProcessWrapper || instance.processMessageSent === this._messageProcessWrapper)
      ) {
        instance.processMessageSent = this.originalProcessMessage;
      }
    }
    this.originalProcessMessage = null;
    this._messageProcessWrapper = null;

    if (this._messageExtractionQueueTimeout) {
      clearTimeout(this._messageExtractionQueueTimeout);
      this._retryTimeouts?.delete(this._messageExtractionQueueTimeout);
      this._messageExtractionQueueTimeout = null;
    }
    this._pendingMessageExtractionCount = 0;
    this._isProcessingMessageExtractionQueue = false;
  },
};
