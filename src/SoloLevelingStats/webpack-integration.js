module.exports = {
  getCurrentUserIdFromStore() {
    try {
      // Resolve UserStore from the cached module, else via the canonical BdApi
      // store API. The legacy webpack init that used to populate
      // this.webpackModules.UserStore is ABSENT in the modular build, so without
      // this getStore fallback the store was never available, currentUserId
      // never resolved, and every message read as "not own" -> zero XP (stuck
      // at lv 1). getStore("UserStore") is the same reliable call used in
      // criticalhit-integration.js.
      let store = this.webpackModules && this.webpackModules.UserStore;
      if (!store && BdApi.Webpack && typeof BdApi.Webpack.getStore === 'function') {
        store = BdApi.Webpack.getStore('UserStore');
        if (store && this.webpackModules) {
          this.webpackModules.UserStore = store; // cache for subsequent calls
        }
      }
      if (store) {
        const user = store.getCurrentUser();
        if (user && user.id) {
          this.currentUserId = user.id;
          this.settings.ownUserId = user.id;
          this.debugLog('USER_STORE', 'Current user ID retrieved', { userId: user.id });
          return user.id;
        }
      }
    } catch (error) {
      this.debugError('USER_STORE', error);
    }
    return null;
  },

  addProcessedMessageId(messageId) {
    if (!messageId) return;
    this.processedMessageIds = this.processedMessageIds || new Set();
    this.processedMessageIds.add(messageId);
  
    // Cap growth to avoid unbounded memory usage over long sessions
    const MAX_PROCESSED_MESSAGE_IDS = 5000;
    if (this.processedMessageIds.size <= MAX_PROCESSED_MESSAGE_IDS) return;
  
    const keepCount = Math.floor(MAX_PROCESSED_MESSAGE_IDS * 0.6);
    const trimmed = Array.from(this.processedMessageIds).slice(-keepCount);
    this.processedMessageIds = new Set(trimmed);
  },
};
