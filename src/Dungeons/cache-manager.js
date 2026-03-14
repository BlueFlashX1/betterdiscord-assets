class CacheManager {
  constructor() {
    this.caches = new Map();
    this.defaultTTL = 5000; // 5 seconds
  }

  set(key, value, ttl = this.defaultTTL) {
    this.caches.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
    });
  }

  get(key) {
    const cached = this.caches.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > cached.ttl) {
      this.caches.delete(key);
      return null;
    }

    return cached.value;
  }

  delete(key) {
    this.caches.delete(key);
  }

  clear() {
    this.caches.clear();
  }

  size() {
    return this.caches.size;
  }
}

module.exports = CacheManager;
