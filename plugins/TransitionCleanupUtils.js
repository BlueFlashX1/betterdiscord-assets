'use strict';

function cancelPendingTransition(target) {
  if (!target || typeof target !== 'object') return;

  if (target._transitionNavTimeout) {
    clearTimeout(target._transitionNavTimeout);
    target._transitionNavTimeout = null;
  }

  if (target._transitionCleanupTimeout) {
    clearTimeout(target._transitionCleanupTimeout);
    target._transitionCleanupTimeout = null;
  }

  target._transitionRunId = (Number(target._transitionRunId) || 0) + 1;

  if (target._transitionStopCanvas?.remove) {
    try { target._transitionStopCanvas.remove(); } catch (_) {}
  }
  target._transitionStopCanvas = null;
}

function clearNavigateRetries(target) {
  const timers = target?._navigateRetryTimers;
  if (!timers || typeof timers.clear !== 'function') return;
  for (const timerId of timers) clearTimeout(timerId);
  timers.clear();
}

function cancelChannelViewFade(target) {
  if (!target || typeof target !== 'object') return;
  target._channelFadeToken = (Number(target._channelFadeToken) || 0) + 1;
  if (target._channelFadeResetTimer) {
    clearTimeout(target._channelFadeResetTimer);
    target._channelFadeResetTimer = null;
  }
}

module.exports = {
  cancelPendingTransition,
  clearNavigateRetries,
  cancelChannelViewFade,
};
