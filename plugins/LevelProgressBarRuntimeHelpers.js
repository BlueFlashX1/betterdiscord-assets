'use strict';

function _toNonNegativeInt(self, value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

function _formatNumber(self, value) {
  return _toNonNegativeInt(self, value).toLocaleString();
}

function _resolveCurrentGuildId(self) {
  const selectedGuildId = self.webpackModules.SelectedGuildStore?.getGuildId?.();
  if (selectedGuildId) return selectedGuildId;

  const selectedChannelId = self.webpackModules.SelectedChannelStore?.getChannelId?.();
  if (!selectedChannelId) return null;

  const channel = self.webpackModules.ChannelStore?.getChannel?.(selectedChannelId);
  return channel?.guild_id || channel?.guildId || null;
}

function _readOnlineCountFromObject(self, value) {
  if (!value || typeof value !== 'object') return null;
  const keys = [
    'online',
    'onlineCount',
    'presence',
    'presenceCount',
    'approximatePresenceCount',
    'approximate_presence_count',
  ];
  for (const key of keys) {
    const parsed = Number(value[key]);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.trunc(parsed);
  }
  return null;
}

function _readOnlineCountFromStoreMethod(self, countStore, methodName, guildId) {
  const method = countStore?.[methodName];
  if (typeof method !== 'function') return null;
  try {
    const result = method.call(countStore, guildId);
    const direct = Number(result);
    if (Number.isFinite(direct) && direct >= 0) return Math.trunc(direct);
    return _readOnlineCountFromObject(self, result);
  } catch (_) {
    return null;
  }
}

function _getGuildOnlineCountFromStore(self, countStore, guildId) {
  if (!countStore || typeof countStore !== 'object') return null;
  const methodNames = [
    'getOnlineCount',
    'getOnlineMemberCount',
    'getPresenceCount',
    'getMemberCounts',
    'getCounts',
    'getGuildCounts',
  ];

  for (const methodName of methodNames) {
    const parsed = _readOnlineCountFromStoreMethod(self, countStore, methodName, guildId);
    if (parsed !== null) return parsed;
  }
  return null;
}

function _getGuildOnlineCount(self, guildId, guild = null) {
  if (!guildId) return 0;
  const countStore = self.webpackModules.GuildMemberCountStore;
  const fromStore = _getGuildOnlineCountFromStore(self, countStore, guildId);
  if (fromStore !== null) return fromStore;

  const fallbackGuild = guild || self.webpackModules.GuildStore?.getGuild?.(guildId);
  const fromGuild = _readOnlineCountFromObject(self, fallbackGuild);
  return fromGuild !== null ? fromGuild : 0;
}

function _getGuildReconCounts(self, guildId) {
  if (!guildId) return { total: 0, online: 0 };

  try {
    const sharedUtils = typeof window !== 'undefined' ? window.SoloLevelingUtils : null;
    const reconInstance = sharedUtils?.getPluginInstance?.('ShadowRecon');
    if (reconInstance && typeof reconInstance.getGuildIntel === 'function') {
      const intel = reconInstance.getGuildIntel(guildId);
      if (intel && typeof intel === 'object') {
        return {
          total: _toNonNegativeInt(self, intel.memberCount),
          online: _toNonNegativeInt(self, intel.onlineCount),
        };
      }
    }
  } catch (error) {
    self.debugError('RECON_INTEL', error, { phase: 'shadowReconBridge' });
  }

  const guild = self.webpackModules.GuildStore?.getGuild?.(guildId);
  const total =
    _toNonNegativeInt(self, self.webpackModules.GuildMemberCountStore?.getMemberCount?.(guildId))
    || _toNonNegativeInt(self, guild?.memberCount)
    || _toNonNegativeInt(self, guild?.member_count);

  return {
    total,
    online: _getGuildOnlineCount(self, guildId, guild),
  };
}

function updateReconIntelText(self) {
  const reconTextEl = self.getCachedElement('#lpb-recon-text');
  if (!reconTextEl) return false;

  const guildId = _resolveCurrentGuildId(self);
  if (!guildId) {
    const wasVisible = reconTextEl.classList.contains('is-visible') || !!reconTextEl.textContent;
    reconTextEl.textContent = '';
    reconTextEl.classList.remove('is-visible');
    self.lastReconText = '';
    return wasVisible;
  }

  const { total, online } = _getGuildReconCounts(self, guildId);
  const nextText = `Members: ${_formatNumber(self, total)} | Online: ${_formatNumber(self, online)}`;
  const changed =
    nextText !== self.lastReconText
    || reconTextEl.textContent !== nextText
    || !reconTextEl.classList.contains('is-visible');
  if (!changed) return false;

  reconTextEl.textContent = nextText;
  reconTextEl.classList.add('is-visible');
  self.lastReconText = nextText;
  return true;
}

function startReconUpdates(self) {
  if (self.reconUpdateInterval) return;
  self.reconUpdateInterval = setInterval(() => {
    if (self._isStopped || !self.settings.enabled || !self.progressBar) return;
    if (document.hidden) return;
    if (!_resolveCurrentGuildId(self)) return;
    updateReconIntelText(self);
  }, 1200);
  self._setTrackedTimeout(() => updateReconIntelText(self), 60);
}

function stopReconUpdates(self) {
  if (self.reconUpdateInterval) {
    clearInterval(self.reconUpdateInterval);
    self.reconUpdateInterval = null;
  }
  self.lastReconText = '';
}

function _shouldSkipProgressBarUpdate(self) {
  if (self.progressBar && self.settings.enabled) {
    self._updateSkipTraced = false;
    return false;
  }

  if (!self._updateSkipTraced) {
    self._trace('UPDATE_BAR', 'Skipping — bar or enabled missing', {
      hasBar: !!self.progressBar,
      barInDOM: self.progressBar ? document.contains(self.progressBar) : false,
      enabled: self.settings.enabled,
    });
    self._updateSkipTraced = true;
  }
  return true;
}

function _buildProgressSnapshot(self, soloData) {
  const levelInfo = soloData?.levelInfo || {};
  const currentLevel = _toNonNegativeInt(self, levelInfo.level);
  const currentXP = _toNonNegativeInt(self, levelInfo.xp);
  const xpRequired = _toNonNegativeInt(self, levelInfo.xpRequired) || 1;
  const xpPercent = Math.min((currentXP / xpRequired) * 100, 100);
  return {
    rank: soloData?.rank ?? 'E',
    currentLevel,
    currentXP,
    xpRequired,
    xpPercent,
  };
}

function _isProgressSnapshotUnchanged(self, snapshot, reconChanged) {
  return (
    self.lastLevel !== null
    && self.lastXP !== null
    && snapshot.currentLevel === self.lastLevel
    && snapshot.currentXP === self.lastXP
    && snapshot.xpRequired === (self.lastXPRequired || 0)
    && !reconChanged
  );
}

function _cacheProgressSnapshot(self, snapshot) {
  self.lastLevel = snapshot.currentLevel;
  self.lastXP = snapshot.currentXP;
  self.lastXPRequired = snapshot.xpRequired;
}

function _updateProgressFill(self, xpPercent) {
  const progressFill = self.getCachedElement('#lpb-progress-fill');
  if (!progressFill) return;

  const newScale = Math.max(0, Math.min(xpPercent / 100, 1));
  const oldScale = parseFloat(progressFill.style.transform?.match(/scaleX\(([^)]+)\)/)?.[1] || '0');
  const isLevelUp = newScale < oldScale - 0.1;

  if (isLevelUp) {
    progressFill.style.transition = 'none';
    progressFill.style.transform = `scaleX(${newScale})`;
    requestAnimationFrame(() => {
      progressFill.style.transition = '';
    });
    return;
  }

  progressFill.style.transform = `scaleX(${newScale})`;
  progressFill.classList.add('lpb-xp-gain');
  self._setTrackedTimeout(() => {
    progressFill.classList.remove('lpb-xp-gain');
  }, 600);
}

function _updateMilestoneMarkersIfNeeded(self, xpPercent) {
  const progressTrack = self.getCachedElement('.lpb-progress-track');
  if (!progressTrack) return;
  const milestones = [25, 50, 75];
  const mask = milestones.reduce(
    (acc, milestone, index) => (xpPercent >= milestone ? acc | (1 << index) : acc),
    0
  );
  if (mask === self._lastMilestoneMask) return;
  self._lastMilestoneMask = mask;
  self.updateMilestoneMarkers(progressTrack, xpPercent);
}

function _syncProgressBarClasses(self) {
  const bar = self.getCachedElement('.lpb-progress-bar');
  bar?.classList.toggle('compact', self.settings.compact);
  const shouldDisableShimmer = !self.settings.showShimmer || self.getPrefersReducedMotion();
  bar?.classList.toggle('lpb-no-shimmer', shouldDisableShimmer);
}

function updateProgressText(self, rank, level, xp, xpRequired) {
  try {
    const progressText = self.getCachedElement('#lpb-progress-text');
    if (!progressText) {
      self.debugLog('UPDATE_TEXT', 'Progress text element not found');
      return;
    }

    const text = `Rank: ${rank} Lv.${level} ${xp}/${xpRequired} XP`;
    progressText.textContent = text;

    self.debugLog('UPDATE_TEXT', 'Progress text updated', {
      rank,
      level,
      xp,
      xpRequired,
      text,
    });
  } catch (error) {
    self.debugError('UPDATE_TEXT', error);
  }
}

function updateProgressBar(self) {
  if (_shouldSkipProgressBarUpdate(self)) return;

  try {
    const reconChanged = updateReconIntelText(self);
    const soloData = self.getSoloLevelingData();
    if (!soloData) {
      self.debugLog('UPDATE_BAR', 'SoloLevelingStats data not available', {
        hasBar: !!self.progressBar,
        enabled: self.settings.enabled,
      });
      return;
    }

    const snapshot = _buildProgressSnapshot(self, soloData);
    if (_isProgressSnapshotUnchanged(self, snapshot, reconChanged)) return;

    self.debugLog('UPDATE_BAR', 'Data changed, updating bar', {
      oldLevel: self.lastLevel,
      newLevel: snapshot.currentLevel,
      oldXP: self.lastXP,
      newXP: snapshot.currentXP,
    });

    _cacheProgressSnapshot(self, snapshot);
    updateProgressText(
      self,
      snapshot.rank,
      snapshot.currentLevel,
      snapshot.currentXP,
      snapshot.xpRequired
    );
    _updateProgressFill(self, snapshot.xpPercent);
    _updateMilestoneMarkersIfNeeded(self, snapshot.xpPercent);
    _syncProgressBarClasses(self);

    self.debugLog('UPDATE_BAR', 'Progress bar updated successfully', {
      level: snapshot.currentLevel,
      xp: snapshot.currentXP,
      xpRequired: snapshot.xpRequired,
      percent: Math.round(snapshot.xpPercent),
      rank: snapshot.rank,
      showLevel: self.settings.showLevel,
      showRank: self.settings.showRank,
      showXP: self.settings.showXP,
    });
  } catch (error) {
    self.debugError('UPDATE_BAR', error, {
      hasBar: !!self.progressBar,
      enabled: self.settings.enabled,
    });
  }
}

module.exports = {
  _toNonNegativeInt,
  _formatNumber,
  _resolveCurrentGuildId,
  _readOnlineCountFromObject,
  _getGuildOnlineCount,
  _readOnlineCountFromStoreMethod,
  _getGuildOnlineCountFromStore,
  _getGuildReconCounts,
  updateReconIntelText,
  startReconUpdates,
  stopReconUpdates,
  _shouldSkipProgressBarUpdate,
  _buildProgressSnapshot,
  _isProgressSnapshotUnchanged,
  _cacheProgressSnapshot,
  _updateProgressFill,
  _updateMilestoneMarkersIfNeeded,
  _syncProgressBarClasses,
  updateProgressBar,
  updateProgressText,
};
