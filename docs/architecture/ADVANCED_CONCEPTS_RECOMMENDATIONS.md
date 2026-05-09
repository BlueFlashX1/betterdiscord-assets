# Advanced Concepts Usage Recommendations

## Executive Summary

**Current Status**: Both plugins are **fully compliant** and use **appropriate approaches** for their functionality.

**Recommendation**: **Selective improvements** recommended, but **NOT a complete rewrite**. The current implementations are solid and follow BetterDiscord best practices.

---

## Analysis: Should Plugins Use More Advanced Concepts?

### Current Implementation Assessment

#### SoloLevelingStats

- ✅ **DOM-based approach** (MutationObserver, querySelector)
- ✅ **React fiber traversal** (read-only data extraction)
- ❌ **No function patching**
- ❌ **No webpack modules**
- ❌ **No React injection**

#### CriticalHit

- ✅ **Function patching** (MessageActions.sendMessage)
- ✅ **Webpack modules** (MessageActions, UserStore)
- ✅ **React fiber traversal** (read-only data extraction)
- ❌ **No React injection**

---

## Recommendations by Concept

### 1. Function Patching (`BdApi.Patcher`)

#### SoloLevelingStats: ⚠️ **CONSIDER** (Low Priority)

**Current Approach**: Uses `MutationObserver` to detect new messages

**Potential Improvement**: Patch message receive functions instead

**Benefits**:

- ✅ More reliable message detection
- ✅ Access to message data before DOM rendering
- ✅ Better performance (no DOM observation overhead)

**Drawbacks**:

- ⚠️ More complex implementation
- ⚠️ Requires webpack module access
- ⚠️ More fragile (Discord updates break patches)

**Recommendation**: **OPTIONAL** - Current DOM approach works well and is more stable

**When to Consider**:

- If message detection becomes unreliable
- If performance issues arise from DOM observation
- If you need message data before DOM rendering

**Example Implementation** (if needed):

```javascript
// Patch message receive function
const MessageActions = BdApi.Webpack.getModule(
  (m) => m.receiveMessage && typeof m.receiveMessage === 'function'
);

BdApi.Patcher.after(
  'SoloLevelingStats',
  MessageActions,
  'receiveMessage',
  (thisObject, args, returnValue) => {
    // Process message for XP/quest tracking
    this.processMessage(returnValue);
  }
);
```

#### CriticalHit: ✅ **ALREADY OPTIMAL**

**Current Approach**: Patches `MessageActions.sendMessage`

**Status**: ✅ **Perfect implementation** - no changes needed

---

### 2. Webpack Modules (`BdApi.Webpack`)

#### SoloLevelingStats: ⚠️ **CONSIDER** (Medium Priority)

**Current Approach**: Uses DOM queries and React fiber traversal

**Potential Improvements**:

**A. Access Message Store** (High Value)

```javascript
// Get message data directly from Discord's store
const MessageStore = BdApi.Webpack.getModule((m) => m.getMessage);
const ChannelStore = BdApi.Webpack.getModule((m) => m.getChannel);
```

**Benefits**:

- ✅ Direct access to message data (no DOM parsing)
- ✅ More reliable (not dependent on DOM structure)
- ✅ Better performance (no querySelector overhead)
- ✅ Access to message metadata (timestamps, authors, etc.)

**Use Cases**:

- Message tracking for XP calculation
- Quest progress tracking
- Activity monitoring

**B. Access User Store** (Medium Value)

```javascript
// Get current user info
const UserStore = BdApi.Webpack.getModule((m) => m.getCurrentUser);
```

**Benefits**:

- ✅ Reliable user ID detection
- ✅ Access to user profile data
- ✅ Better than React fiber traversal

**Current Workaround**: Uses React fiber traversal (works but less reliable)

**C. Access Activity Store** (Low Value)

```javascript
// Get activity/status data
const ActivityStore = BdApi.Webpack.getModule((m) => m.getActivities);
```

**Benefits**:

- ✅ Track user activity status
- ✅ Integration with Discord's activity system

**Recommendation**: **RECOMMENDED** for MessageStore and UserStore access

**Priority**:

1. **MessageStore** - High priority (replaces DOM observation)
2. **UserStore** - Medium priority (more reliable than fiber traversal)
3. **ActivityStore** - Low priority (nice-to-have)

#### CriticalHit: ✅ **ALREADY OPTIMAL**

**Current Approach**: Uses MessageActions and UserStore

**Status**: ✅ **Perfect implementation** - no changes needed

---

### 3. React Injection (`BdApi.Patcher` on React Components)

#### SoloLevelingStats: ⚠️ **CONSIDER** (High Priority)

**Current Approach**: Creates DOM elements and injects via `appendChild`

**UI Elements Created**:

- Chat UI panel (`.sls-chat-panel`)
- Stats display
- Quest panel
- Achievement display
- HP/Mana bars

**Potential Improvement**: Inject React components into Discord's React tree

**Benefits**:

- ✅ Better integration with Discord's UI
- ✅ Automatic cleanup on Discord updates
- ✅ Access to Discord's React Context
- ✅ More stable (less dependent on DOM structure)
- ✅ Better styling integration

**Drawbacks**:

- ⚠️ More complex implementation
- ⚠️ Requires finding correct React components to patch
- ⚠️ More fragile (Discord React updates break patches)

**Recommendation**: **RECOMMENDED** for main UI panel

**Implementation Strategy**:

```javascript
// Find Discord's main content area React component
const MainContent = BdApi.Webpack.getByStrings('chatContent', { defaultExport: false });

BdApi.Patcher.after('SoloLevelingStats', MainContent, 'Z', (thisObject, args, returnValue) => {
  // Inject UI panel into Discord's React tree
  const uiPanel = this.renderChatUI();
  // Add to returnValue.props.children
});
```

**When to Use**:

- Main chat UI panel (high value)
- Stats display (medium value)
- Quest panel (medium value)

**When NOT to Use**:

- Temporary notifications (DOM is fine)
- Overlays (DOM is fine)
- Simple UI elements (DOM is simpler)

#### CriticalHit: ❌ **NOT RECOMMENDED**

**Current Approach**: Creates DOM overlays for animations

**Status**: ✅ **DOM approach is correct** - animations don't need React injection

**Reason**: Visual effects/animations work better as DOM overlays, not React components

---

## Priority Recommendations

### High Priority (Recommended)

#### 1. SoloLevelingStats: Use MessageStore via Webpack

**Impact**: High - More reliable message tracking
**Effort**: Medium
**Risk**: Low - Official API usage

**Implementation**:

```javascript
// Replace DOM observation with MessageStore access
const MessageStore = BdApi.Webpack.getModule((m) => m.getMessage);
const ChannelStore = BdApi.Webpack.getModule((m) => m.getChannel);

// Listen to message events
BdApi.Patcher.after(
  'SoloLevelingStats',
  MessageStore,
  'receiveMessage',
  (thisObject, args, returnValue) => {
    this.processMessage(returnValue);
  }
);
```

#### 2. SoloLevelingStats: Use UserStore via Webpack

**Impact**: Medium - More reliable user ID detection
**Effort**: Low
**Risk**: Low - Official API usage

**Implementation**:

```javascript
// Replace React fiber traversal with UserStore
const UserStore = BdApi.Webpack.getModule((m) => m.getCurrentUser);
const user = UserStore.getCurrentUser();
this.currentUserId = user?.id;
```

### Medium Priority (Consider)

#### 3. SoloLevelingStats: React Injection for Main UI Panel

**Impact**: Medium - Better UI integration
**Effort**: High
**Risk**: Medium - More fragile to Discord updates

**Consideration**: Only if DOM approach becomes problematic

### Low Priority (Optional)

#### 4. SoloLevelingStats: Function Patching for Message Receive

**Impact**: Low - Current DOM approach works well
**Effort**: Medium
**Risk**: Medium - More fragile

**Consideration**: Only if message detection becomes unreliable

---

## Trade-offs Analysis

### DOM-Based Approach (Current - SoloLevelingStats)

**Pros**:

- ✅ More stable (less affected by Discord updates)
- ✅ Simpler implementation
- ✅ Easier to debug
- ✅ Works with any DOM structure

**Cons**:

- ❌ Less reliable (depends on DOM structure)
- ❌ Performance overhead (querySelector, MutationObserver)
- ❌ No access to message metadata before DOM rendering

### Webpack + Patching Approach (Recommended)

**Pros**:

- ✅ More reliable (direct access to Discord data)
- ✅ Better performance (no DOM overhead)
- ✅ Access to data before DOM rendering
- ✅ Official BetterDiscord API

**Cons**:

- ⚠️ More fragile (breaks on Discord updates)
- ⚠️ More complex implementation
- ⚠️ Requires webpack module discovery

### React Injection Approach (Optional)

**Pros**:

- ✅ Better UI integration
- ✅ Access to React Context
- ✅ Automatic cleanup
- ✅ More stable UI positioning

**Cons**:

- ⚠️ More fragile (React updates break patches)
- ⚠️ Complex implementation
- ⚠️ Harder to debug

---

## Implementation Roadmap

### Phase 1: Webpack Module Access (Recommended)

**Timeline**: 1-2 days
**Risk**: Low
**Impact**: High

1. Add MessageStore access
2. Add UserStore access
3. Replace DOM observation with store-based tracking
4. Keep DOM as fallback

### Phase 2: React Injection (Optional)

**Timeline**: 2-3 days
**Risk**: Medium
**Impact**: Medium

1. Find target React components
2. Implement React injection for main UI panel
3. Keep DOM as fallback
4. Test thoroughly

### Phase 3: Function Patching (Low Priority)

**Timeline**: 1 day
**Risk**: Medium
**Impact**: Low

1. Only if Phase 1 shows issues
2. Patch message receive functions
3. Keep DOM as fallback

---

## Final Recommendations

### SoloLevelingStats

**Recommended Changes**:

1. ✅ **Add Webpack Module Access** (High Priority)

   - MessageStore for message tracking
   - UserStore for user ID detection
   - Keep DOM as fallback

2. ⚠️ **Consider React Injection** (Medium Priority)

   - Only for main UI panel
   - Keep DOM as fallback
   - Only if DOM approach becomes problematic

3. ❌ **Skip Function Patching** (Low Priority)
   - Current DOM approach works well
   - Not worth the added complexity

**Result**: More reliable, better performance, still stable

### CriticalHit

**Recommended Changes**:

1. ✅ **No changes needed** - Already optimal
   - Uses function patching correctly
   - Uses webpack modules correctly
   - DOM approach for animations is correct

**Result**: Keep as-is

---

## Conclusion

**Should plugins be revised?**: **PARTIALLY**

**SoloLevelingStats**:

- ✅ **YES** - Add webpack module access (MessageStore, UserStore)
- ⚠️ **MAYBE** - Consider React injection for main UI (optional)
- ❌ **NO** - Skip function patching (not needed)

**CriticalHit**:

- ✅ **NO** - Already optimal, no changes needed

**Key Principle**: Use advanced concepts when they provide clear benefits, not just because they're available. The current implementations are solid - improvements should be targeted and justified.

---

## References

- [Function Patching Guide](https://docs.betterdiscord.app/plugins/concepts/patching)
- [Webpack Modules Guide](https://docs.betterdiscord.app/plugins/concepts/webpack)
- [React Injection Guide](https://docs.betterdiscord.app/plugins/concepts/react)

---

**Last Updated**: 2025-12-06
