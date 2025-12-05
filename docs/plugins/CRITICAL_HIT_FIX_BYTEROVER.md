# Fix: Duplicate Critical Hit Animations - Position-Based Duplicate Detection

## Problem

The critical hit animation was firing **twice** for the same logical message. The animation would trigger:
1. First when the message was sent (before crit confirmation)
2. Second when the message was confirmed as a critical hit

## Root Cause

The issue occurred because **Discord's message rendering system removes and re-adds message elements to the DOM during processing**. When a message is sent:

1. Initial message element is created with a temporary/initial `messageId`
2. Element is removed from DOM
3. Element is re-added with a new, final `messageId` after crit confirmation
4. The duplicate detection only checked by `messageId`, so it couldn't detect that the same logical message (same position) was being animated twice

**Key observation from debug logs:**
- First `onCritHit` call: `messageId: "1445232539064074240"` → added to `animatedMessages`
- Element removed in RAF: `stillInDOM: false`, `elementChanged: true`
- Second `onCritHit` call 11ms later: `messageId: "1445232539420852376"` (different ID!)
- Position-based check couldn't find the first entry because it was deleted when element was removed

## Solution

Implemented **position-based duplicate detection** that runs BEFORE the atomic `messageId` check:

### 1. Changed Data Structure

Changed `animatedMessages` from `Set` to `Map` to store position and timestamp data:

```javascript
// Before:
this.animatedMessages = new Set();

// After:
this.animatedMessages = new Map(); // Store { position, timestamp, messageId }
```

### 2. Track Element Position and Timestamp

When `onCritHit` is called, capture element position and timestamp:

```javascript
// Get element position for duplicate detection (same position = same logical message)
const elementRect = messageElement.getBoundingClientRect();
const elementPosition = {
  x: elementRect.left + elementRect.width / 2,
  y: elementRect.top + elementRect.height / 2,
};
const elementTimestamp = Date.now();
```

### 3. Position-Based Duplicate Detection

Run position-based check BEFORE atomic check:

```javascript
// Enhanced duplicate detection: check by messageId AND by position/timing
// This handles cases where the same logical message gets a new messageId after being removed/re-added
const positionTolerance = 50; // pixels
const timeTolerance = 2000; // ms (2 seconds - enough for message replacement)

// Check if a message at the same position was recently animated
// This includes entries that were removed (for duplicate detection when messageId changes)
let isDuplicateByPosition = false;
const currentTime = Date.now();

for (const [trackedMessageId, trackedData] of this.animatedMessages.entries()) {
  if (trackedData && typeof trackedData === 'object' && trackedData.position) {
    // Skip if entry is too old (beyond timeTolerance) - clean up old entries
    const timeSinceTracked = currentTime - trackedData.timestamp;
    if (timeSinceTracked > timeTolerance) {
      this.animatedMessages.delete(trackedMessageId);
      continue;
    }
    
    const positionDiff =
      Math.abs(trackedData.position.x - elementPosition.x) +
      Math.abs(trackedData.position.y - elementPosition.y);
    const timeDiff = elementTimestamp - trackedData.timestamp;
    
    // Check by position/timing (works even if trackedData.removed is true)
    if (positionDiff < positionTolerance && timeDiff < timeTolerance) {
      isDuplicateByPosition = true;
      break;
    }
  }
}

if (isDuplicateByPosition) {
  return; // Same logical message, skip animation
}
```

### 4. Store Position/Timestamp with MessageId

Store position and timestamp data with each messageId:

```javascript
// ATOMIC check-and-add to prevent race conditions
// Store position and timestamp with messageId for enhanced duplicate detection
const sizeBefore = this.animatedMessages.size;
const wasAlreadyAnimated = this.animatedMessages.has(messageId);
// Store as object with position and timestamp for enhanced duplicate detection
this.animatedMessages.set(messageId, {
  position: elementPosition,
  timestamp: elementTimestamp,
  messageId: messageId,
});
const sizeAfter = this.animatedMessages.size;
const isNewlyAdded = sizeAfter > sizeBefore;
```

### 5. Keep Entries When Element Removed

**Critical**: Don't delete entries immediately when element is removed in RAF - keep them for the `timeTolerance` period so position-based detection can catch duplicates even when `messageId` changes.

## Key Patterns & Lessons Learned

### Pattern: Position-Based Duplicate Detection
When DOM elements can be replaced with new IDs, track by **position/timing** instead of just ID.

**When to use:**
- DOM elements are removed and re-added with new IDs
- Same logical entity (same position) gets different identifiers
- Need to detect duplicates across element replacements

**Implementation:**
1. Track element position (`getBoundingClientRect()`) and timestamp
2. Compare position differences (within tolerance) and time differences (within window)
3. Run position check BEFORE ID-based check
4. Keep entries for tolerance period even when elements are removed

### Pattern: Run Position Check Before Atomic Check
Position-based detection must run **first** to catch duplicates when IDs change. If you run ID check first, you'll miss duplicates when the ID changes.

### Pattern: Keep Entries for Tolerance Period
Don't delete entries immediately when elements are removed - keep them for the duplicate detection window. Only delete after tolerance period expires.

### Pattern: Clean Up Old Entries
Remove entries after tolerance period expires to prevent memory leaks. Check age during position-based duplicate detection loop.

## Code Location

**File:** `betterdiscord-dev/plugins/CriticalHitAnimation.plugin.js`

**Key sections:**
- Line 28: `this.animatedMessages = new Map();`
- Lines 211-217: Element position and timestamp tracking
- Lines 237-271: Position-based duplicate detection
- Lines 278-282: Storing position/timestamp with messageId

## Impact

- ✅ Prevents duplicate animations when message elements are replaced
- ✅ Handles element replacement scenarios gracefully
- ✅ Maintains smooth fade-out animation
- ✅ Cleans up old entries automatically
- ✅ Works even when messageId changes after element replacement

## Related Issues

- Element replacement in Discord's message rendering
- Race conditions in duplicate detection
- Memory management for tracking entries

## Testing

Verified with debug logs showing:
- First messageId added to `animatedMessages`
- Element removed in RAF (detected correctly)
- Second messageId with different ID arrives 11ms later
- Position-based check detects duplicate and skips animation
- Animation fires only once per critical hit message
