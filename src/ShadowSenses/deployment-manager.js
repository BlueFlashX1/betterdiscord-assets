const { PLUGIN_NAME, RANKS } = require("./constants");
const { _ttl } = require("./shared-utils");

class DeploymentManager {
  constructor(debugLog, debugError) {
    this._debugLog = debugLog;
    this._debugError = debugError;
    this._deployments = [];
    this._monitoredUserIds = new Set();
    this._deployedShadowIds = new Set();
    this._availableCache = _ttl(5000); // 5s TTL — avoids redundant IDB reads
  }

  load() {
    try {
      const saved = BdApi.Data.load(PLUGIN_NAME, "deployments");
      this._deployments = Array.isArray(saved) ? saved : [];
      this._rebuildSets();
      this._debugLog("DeploymentManager", "Loaded deployments", { count: this._deployments.length });
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to load deployments", err);
      this._deployments = [];
      this._rebuildSets();
    }
  }

  _save() {
    try {
      BdApi.Data.save(PLUGIN_NAME, "deployments", this._deployments);
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to save deployments", err);
    }
  }

  _rebuildSets() {
    this._monitoredUserIds = new Set(this._deployments.map(d => d.targetUserId));
    this._deployedShadowIds = new Set(this._deployments.map(d => d.shadowId));
  }

  async deploy(shadow, targetUser) {
    if (!shadow || !shadow.id || !targetUser) {
      this._debugError("DeploymentManager", "Invalid deploy args", { shadow, targetUser });
      return false;
    }

    if (this._deployedShadowIds.has(shadow.id)) {
      this._debugLog("DeploymentManager", "Shadow already deployed", shadow.id);
      return false;
    }

    const targetUserId = targetUser.id || targetUser.userId;
    if (!targetUserId) {
      this._debugError("DeploymentManager", "No target user ID");
      return false;
    }

    if (this._monitoredUserIds.has(targetUserId)) {
      this._debugLog("DeploymentManager", "User already monitored", targetUserId);
      return false;
    }

    // Re-verify shadow is still available before committing deployment
    try {
      const currentAvailable = await this.getAvailableShadows();
      const stillAvailable = currentAvailable.find(s => s.id === shadow.id);
      if (!stillAvailable) {
        this._debugLog("DeploymentManager", `Shadow ${shadow.id} no longer available, aborting deployment`);
        return false;
      }
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to re-verify shadow availability", err);
      // Proceed with deployment if verification fails — better than blocking
    }

    const record = {
      shadowId: shadow.id,
      shadowName: shadow.roleName || shadow.role || "Shadow",
      shadowRank: shadow.rank || "E",
      targetUserId,
      targetUsername: targetUser.username || targetUser.globalName || "Unknown",
      deployedAt: Date.now(),
    };

    this._deployments.push(record);
    this._rebuildSets();
    this._availableCache.invalidate(); // deployment state changed
    this._save();
    this._debugLog("DeploymentManager", "Deployed shadow", record);
    return true;
  }

  recall(shadowId) {
    const idx = this._deployments.findIndex(d => d.shadowId === shadowId);
    if (idx === -1) return false;

    this._deployments.splice(idx, 1);
    this._rebuildSets();
    this._availableCache.invalidate(); // deployment state changed
    this._save();
    this._debugLog("DeploymentManager", "Recalled shadow", shadowId);
    return true;
  }

  getDeploymentForUser(userId) {
    return this._deployments.find(d => d.targetUserId === userId) || null;
  }

  getDeployments() {
    return [...this._deployments];
  }

  getDeploymentCount() {
    return this._deployments.length;
  }

  getMonitoredUserIds() {
    return this._monitoredUserIds;
  }

  _getShadowArmyInstance() {
    if (!BdApi.Plugins.isEnabled("ShadowArmy")) {
      this._debugError("DeploymentManager", "ShadowArmy plugin not enabled");
      return null;
    }
    const armyPlugin = BdApi.Plugins.get("ShadowArmy");
    if (!armyPlugin?.instance) {
      this._debugError("DeploymentManager", "ShadowArmy plugin not available");
      return null;
    }
    return armyPlugin.instance;
  }

  _getExchangeMarkedIds() {
    try {
      if (!BdApi.Plugins.isEnabled("ShadowExchange")) return new Set();
      const exchangePlugin = BdApi.Plugins.get("ShadowExchange");
      if (typeof exchangePlugin?.instance?.getMarkedShadowIds !== "function") return new Set();
      return exchangePlugin.instance.getMarkedShadowIds();
    } catch (err) {
      this._debugLog("DeploymentManager", "ShadowExchange not available for exclusion", err);
      return new Set();
    }
  }

  _extractShadowId(shadow) {
    return shadow?.id || shadow?.extractedData?.id || null;
  }

  _collectShadowIds(source, targetSet) {
    if (!Array.isArray(source)) return;
    for (const shadow of source) {
      const shadowId = this._extractShadowId(shadow);
      if (shadowId) targetSet.add(shadowId);
    }
  }

  _collectAllocatedShadowIds(allocationMap, targetSet) {
    if (!(allocationMap instanceof Map)) return;
    for (const shadows of allocationMap.values()) {
      this._collectShadowIds(shadows, targetSet);
    }
  }

  _getDungeonsSnapshot() {
    const snapshot = {
      dungeonAllocatedIds: new Set(),
      reserveIds: new Set(),
    };

    try {
      if (!BdApi.Plugins.isEnabled("Dungeons")) return snapshot;
      const dungeonsPlugin = BdApi.Plugins.get("Dungeons");
      const instance = dungeonsPlugin?.instance;
      if (!instance) return snapshot;

      this._collectShadowIds(instance.shadowReserve, snapshot.reserveIds);
      this._collectAllocatedShadowIds(instance.shadowAllocations, snapshot.dungeonAllocatedIds);
    } catch (err) {
      this._debugLog("DeploymentManager", "Dungeons not available for exclusion", err);
    }

    return snapshot;
  }

  _buildAvailableShadowList(allShadows, exclusion) {
    return allShadows.filter((shadow) => {
      const sid = shadow?.id;
      if (!sid) return false;
      if (exclusion.deployedIds.has(sid)) return false;
      if (exclusion.exchangeMarkedIds.has(sid)) return false;
      if (exclusion.reserveIds.has(sid)) return true;             // Reserve = idle = available
      if (exclusion.dungeonAllocatedIds.has(sid)) return false;   // In dungeon = unavailable
      return true;
    });
  }

  _injectDungeonFallbackShadow(available, allShadows, exclusion) {
    if (available.length > 0 || exclusion.dungeonAllocatedIds.size === 0) return;

    const fallback = allShadows
      .filter((shadow) => {
        const sid = shadow?.id;
        if (!sid) return false;
        if (!exclusion.dungeonAllocatedIds.has(sid)) return false;
        if (exclusion.deployedIds.has(sid)) return false;
        if (exclusion.exchangeMarkedIds.has(sid)) return false;
        return true;
      })
      .sort((a, b) => RANKS.indexOf(a.rank || "E") - RANKS.indexOf(b.rank || "E"))[0];

    if (fallback) available.push(fallback);
  }

  async getAvailableShadows() {
    // 5s TTL cache — avoids redundant IDB reads + 3 cross-plugin lookups
    const cached = this._availableCache.get();
    if (cached) return cached;
    try {
      const armyInstance = this._getShadowArmyInstance();
      if (!armyInstance) return [];

      // CROSS-PLUGIN SNAPSHOT: Use ShadowArmy's shared snapshot if fresh, else fall back to IDB
      const allShadows = armyInstance.getShadowSnapshot?.() || await armyInstance.getAllShadows();
      if (!Array.isArray(allShadows)) return [];

      const dungeons = this._getDungeonsSnapshot();
      const exclusion = {
        deployedIds: this._deployedShadowIds,
        exchangeMarkedIds: this._getExchangeMarkedIds(),
        dungeonAllocatedIds: dungeons.dungeonAllocatedIds,
        reserveIds: dungeons.reserveIds,
      };

      const available = this._buildAvailableShadowList(allShadows, exclusion);
      this._injectDungeonFallbackShadow(available, allShadows, exclusion);

      this._debugLog("DeploymentManager", "Available shadows", {
        total: allShadows.length,
        available: available.length,
        deployed: exclusion.deployedIds.size,
        exchangeMarked: exclusion.exchangeMarkedIds.size,
        dungeonAllocated: exclusion.dungeonAllocatedIds.size,
        reservePool: exclusion.reserveIds.size,
      });

      this._availableCache.set(available);
      return available;
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to get available shadows", err);
      return [];
    }
  }
}

module.exports = { DeploymentManager };
