module.exports = {
  startMobKillNotifications(channelKey) {
    this._mobKillChannels || (this._mobKillChannels = new Set());
    this._mobKillChannels.add(channelKey);
    if (!this._mobKillGlobalTimer) {
      this._mobKillGlobalTimer = setInterval(() => {
        if (!this.isWindowVisible()) return; // PERF(P5-3): Skip kill summaries when hidden
        if (!this._mobKillChannels || this._mobKillChannels.size === 0) {
          clearInterval(this._mobKillGlobalTimer);
          this._mobKillGlobalTimer = null;
          return;
        }
        this._mobKillChannels.forEach((ck) => this.showMobKillSummary(ck));
      }, Math.max(1000, this.settings.mobKillNotificationInterval || 10000));
      this._intervals.add(this._mobKillGlobalTimer);
    }
  },

  stopMobKillNotifications(channelKey) {
    if (this._mobKillChannels) this._mobKillChannels.delete(channelKey);
    if (this._mobKillChannels && this._mobKillChannels.size === 0 && this._mobKillGlobalTimer) {
      clearInterval(this._mobKillGlobalTimer);
      this._intervals.delete(this._mobKillGlobalTimer);
      this._mobKillGlobalTimer = null;
    }
  },

  stopAllDungeonCleanup() {
    if (this._mobKillChannels) this._mobKillChannels.clear();
    if (this._mobKillGlobalTimer) {
      clearInterval(this._mobKillGlobalTimer);
      this._intervals.delete(this._mobKillGlobalTimer);
      this._mobKillGlobalTimer = null;
    }
    this.stopAllMobSpawning();
    if (this.dungeonCleanupInterval) {
      clearInterval(this.dungeonCleanupInterval);
      this._intervals.delete(this.dungeonCleanupInterval);
      this.dungeonCleanupInterval = null;
    }
  },

  showMobKillSummary(channelKey) {
    const notification = this.settings.mobKillNotifications[channelKey];
    if (!notification || notification.count === 0) return;
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return;
    notification.count = 0;
    notification.lastNotification = Date.now();
    // PERF: No saveSettings() — kill counts persist via next combat-tick debounced save
  },

  startDungeonCleanupLoop() {
    if (this.dungeonCleanupInterval) return;
    this.dungeonCleanupInterval = setInterval(() => {
      this.cleanupExpiredDungeons();
    }, 60000);
    this._intervals.add(this.dungeonCleanupInterval);
  },

  cleanupExpiredDungeons() {
    const now = Date.now();
    const expiredChannels = [];
    const NEVER_ENGAGED_EXPIRY_MS = 60000;  // 1 minute — never deployed, never joined
    const DISENGAGED_EXPIRY_MS = 180000;   // 3 minutes — had engagement that was withdrawn
    this.activeDungeons.forEach((dungeon, channelKey) => {
      if (dungeon.completed || dungeon.failed) return;

      // BUGFIX LOGIC-9: Recover dungeons stranded with _completing=true for >30s
      if (dungeon._completing) {
        const strandedAge = now - (dungeon._completingStartedAt || now);
        if (strandedAge > 30000) {
          dungeon._completing = false;
          expiredChannels.push(channelKey);
        }
        return;
      }

      // Never expire while actively engaged
      if (dungeon.shadowsDeployed || dungeon.userParticipating) {
        dungeon._idleSince = null;
        return;
      }

      if (!dungeon._idleSince) {
        dungeon._idleSince = now;
      }

      // Tiered expiry: dungeons that were NEVER engaged expire faster (1 min)
      // than ones where shadows were deployed then withdrawn (3 min).
      const wasEverEngaged = dungeon.deployedAt != null;
      const expiryMs = wasEverEngaged ? DISENGAGED_EXPIRY_MS : NEVER_ENGAGED_EXPIRY_MS;
      if (now - dungeon._idleSince >= expiryMs) {
        expiredChannels.push(channelKey);
      }
    });
    expiredChannels.forEach((channelKey) => {
      this.completeDungeon(channelKey, 'timeout');
    });

    // Expire unextracted defeated bosses after 5 min (avoids per-boss long-lived timers)
    if (this.defeatedBosses && this.defeatedBosses.size > 0) {
      const expiredBossKeys = [];
      for (const [channelKey, bossData] of this.defeatedBosses.entries()) {
        const ts = bossData?.timestamp || 0;
        now - ts >= 5 * 60 * 1000 && expiredBossKeys.push(channelKey);
      }

      // Cap per-tick cleanups to avoid spikes
      const MAX_BOSS_CLEANUPS_PER_TICK = 3;
      expiredBossKeys.slice(0, MAX_BOSS_CLEANUPS_PER_TICK).forEach((channelKey) => {
        this.cleanupDefeatedBoss(channelKey);
      });
    }
  }
};
