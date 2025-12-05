# Helper Function Reorganization Plan

## Current State Analysis

**Section 2** (lines 248-911) currently has:

- Line 252-254: Header says "MESSAGE HISTORY HELPERS" but...
- Line 256-612: Actually contains **RESTORATION EXECUTION HELPERS** (performCritRestoration and related)
- Line 614-911: **SETTINGS PANEL HELPERS**

**Section 3** contains many helper functions scattered throughout that need to be moved:

- **MESSAGE HISTORY HELPERS** (from addToHistory):

  - `normalizeMessageData()` - line 1738
  - `updatePendingCritsQueue()` - line 1780
  - `findExistingHistoryEntry()` - line 1840

- **CHANNEL RESTORATION HELPERS** (from restoreChannelCrits):

  - `findMessagesInDOM()` - line 2108
  - `matchCritToMessage()` - line 2163
  - `restoreSingleCrit()` - line 2196
  - `setupRestorationRetryObserver()` - line 2237

- **STYLE APPLICATION HELPERS - Settings-based** (from applyCritStyleWithSettings):

  - `applyGradientStylesWithSettings()` - line 2522
  - `setupGradientRetryObserver()` - line 2579
  - `applySolidColorStyles()` - line 2619
  - `applyFontStyles()` - line 2643
  - `applyGlowEffect()` - line 2661
  - `setupGradientMonitoring()` - line 2689
  - `setupGradientRestorationRetryObserver()` - line 2763

- **STYLE APPLICATION HELPERS - Direct** (from applyCritStyle):

  - `isInHeaderArea()` - appears TWICE: line 1419 AND 4496 (duplicate!)
  - `findMessageContentForStyling()` - line 4578
  - `applyGradientToContentForStyling()` - line 4682
  - `applySolidColorToContentForStyling()` - line 4733
  - `applyGlowToContentForStyling()` - line 4754

- **CRIT DETECTION HELPERS** (from checkForCrit):

  - `handleQueuedMessage()` - line 3945
  - `calculateCritRoll()` - line 4004
  - `processNewCrit()` - line 4034
  - `processNonCrit()` - line 4112

- **RESTORATION DETECTION HELPERS** (from checkForRestoration):
  - `findMessageElementForRestoration()` - line 3592
  - `shouldThrottleRestorationCheck()` - line 3616
  - `calculateContentHashForRestoration()` - line 3639
  - `findHistoryEntryForRestoration()` - line 3660

## Proposed Section 2 Organization

```
// ============================================================================
// HELPER FUNCTIONS - EXTRACTED FROM LONG FUNCTIONS
// ============================================================================

// ============================================================================
// MESSAGE HISTORY HELPERS (from addToHistory)
// ============================================================================
- normalizeMessageData()
- updatePendingCritsQueue()
- findExistingHistoryEntry()

// ============================================================================
// CHANNEL RESTORATION HELPERS (from restoreChannelCrits)
// ============================================================================
- findMessagesInDOM()
- matchCritToMessage()
- restoreSingleCrit()
- setupRestorationRetryObserver()

// ============================================================================
// STYLE APPLICATION HELPERS - Settings-based (from applyCritStyleWithSettings)
// ============================================================================
- applyGradientStylesWithSettings()
- setupGradientRetryObserver()
- applySolidColorStyles()
- applyFontStyles()
- applyGlowEffect()
- setupGradientMonitoring()
- setupGradientRestorationRetryObserver()

// ============================================================================
// STYLE APPLICATION HELPERS - Direct (from applyCritStyle)
// ============================================================================
- isInHeaderArea() [KEEP ONLY ONE VERSION - the more complete one]
- findMessageContentForStyling()
- applyGradientToContentForStyling()
- applySolidColorToContentForStyling()
- applyGlowToContentForStyling()

// ============================================================================
// CRIT DETECTION HELPERS (from checkForCrit)
// ============================================================================
- handleQueuedMessage()
- calculateCritRoll()
- processNewCrit()
- processNonCrit()

// ============================================================================
// RESTORATION DETECTION HELPERS (from checkForRestoration)
// ============================================================================
- findMessageElementForRestoration()
- shouldThrottleRestorationCheck()
- calculateContentHashForRestoration()
- findHistoryEntryForRestoration()

// ============================================================================
// RESTORATION EXECUTION HELPERS (from checkForRestoration - performCritRestoration)
// ============================================================================
- performCritRestoration()
- setupRestorationGradientVerification()
- triggerRestorationAnimation()
- setupAnimationRetryObserver()
- setupRestorationStyleMonitoring()

// ============================================================================
// SETTINGS PANEL HELPERS (from getSettingsPanel)
// ============================================================================
- syncSliderInputPair()
- setupSettingsDisplayObserver()
- attachBasicSettingsListeners()
- attachFilterListeners()
- attachHistoryListeners()
- attachAnimationListeners()
- attachDebugListeners()
```

## Action Items

1. Fix mislabeled header in Section 2 (line 252)
2. Move all helpers from Section 3 to Section 2 in organized sections
3. Remove duplicate `isInHeaderArea()` function (keep the more complete version at line 4496)
4. Remove all helpers from Section 3 after moving them
5. Double-check all functions are in Section 2
