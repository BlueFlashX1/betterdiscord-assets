module.exports = {
  on(eventName, callback) {
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = [];
    }
    this.eventListeners[eventName].push(callback);
  
    // Return unsubscribe function
    return () => {
      const index = this.eventListeners[eventName].indexOf(callback);
      if (index > -1) {
        this.eventListeners[eventName].splice(index, 1);
      }
    };
  },

  emit(eventName, data = {}) {
    const listeners = Array.isArray(this.eventListeners[eventName])
      ? this.eventListeners[eventName].slice()
      : [];

    // Call all local listeners first (snapshot protects against mid-emit unsubscribe mutations).
    listeners.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        this.debugError('EVENT_EMIT', error, { eventName, callback: callback.name || 'anonymous' });
      }
    });
  
    // Secondary event channel: DOM CustomEvent for cross-plugin reliability
    // (Some plugins may not have direct access to this instance's on/off methods in all BD environments)
    try {
      const CustomEventCtor = typeof window !== 'undefined' ? window.CustomEvent : null;
      typeof document?.dispatchEvent === 'function' &&
        typeof CustomEventCtor === 'function' &&
        document.dispatchEvent(
          new CustomEventCtor(`SoloLevelingStats:${eventName}`, {
            detail: data,
          })
        );
    } catch (error) {
      // Never allow event dispatch to break game loop
      this.debugError('EVENT_EMIT', error, { eventName, phase: 'custom_event_dispatch' });
    }
  },

  emitXPChanged() {
    try {
      const levelInfo = this.getEventLevelInfoOrNull('EMIT_XP_CHANGED');
      if (!levelInfo) return;
  
      const xpData = {
        level: this.settings.level,
        rank: this.settings.rank,
        ...this.buildCoreProgressPayload(levelInfo),
      };
  
      this._chatUIDirty = true;
      this.emit('xpChanged', xpData);
  
      // Trigger UI update immediately after emit
      try {
        this.updateChatUI();
      } catch (error) {
        this.debugError('EMIT_XP_CHANGED', error, { phase: 'ui_update_after_emit' });
      }
    } catch (error) {
      this.debugError('EMIT_XP_CHANGED', error);
    }
  },

  emitLevelChanged(oldLevel, newLevel) {
    try {
      const levelInfo = this.getEventLevelInfoOrNull('EMIT_LEVEL_CHANGED');
      if (!levelInfo) return;
  
      this.emit('levelChanged', {
        oldLevel,
        newLevel,
        rank: this.settings.rank,
        ...this.buildCoreProgressPayload(levelInfo),
      });
  
      // Also emit XP changed since level affects XP display
      this.emitXPChanged();
    } catch (error) {
      this.debugError('EMIT_LEVEL_CHANGED', error);
    }
  },

  emitRankChanged(oldRank, newRank) {
    try {
      const levelInfo = this.getEventLevelInfoOrNull('EMIT_RANK_CHANGED');
      if (!levelInfo) return;
  
      this.emit('rankChanged', {
        oldRank,
        newRank,
        level: this.settings.level,
        ...this.buildCoreProgressPayload(levelInfo),
      });
  
      // Also emit XP changed since rank affects XP display
      this.emitXPChanged();
    } catch (error) {
      this.debugError('EMIT_RANK_CHANGED', error);
    }
  }
};
