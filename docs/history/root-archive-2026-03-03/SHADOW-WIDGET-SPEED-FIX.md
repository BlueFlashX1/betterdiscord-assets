# Shadow Army Widget - Speed Optimization

## Problem

The Shadow Army widget was taking **5+ seconds** to appear after plugin start, causing a poor user experience.

## Root Cause

Multiple **unnecessary delays** were stacked:

### Before Fix:
```javascript
// Delay 1: Initial widget injection (3000ms)
setTimeout(() => {
  this.injectShadowRankWidget();
}, 3000);

// Delay 2: Inside injectShadowRankWidget() (2000ms)
await new Promise(resolve => setTimeout(resolve, 2000));

// Delay 3: Retry if member list not found (2000ms)
setTimeout(() => this.injectShadowRankWidget(), 2000);

// Total: 3000 + 2000 = 5000ms (5 seconds!)
```

### Additional Delays:
- **Channel switch**: 500ms delay before re-injection
- **MutationObserver**: 500ms debounce delay
- **Member list check**: 2000ms retry delay

## Solution - Smart Fast Injection

### ✅ Optimized Delays:

1. **Initial Injection**: `3000ms` → `100ms` (30x faster!)
2. **Member List Check**: `2000ms wait` → `Instant check` (no wait!)
3. **Retry Logic**: `2000ms` → `200ms` (10x faster!)
4. **Channel Switch**: `500ms` → `200ms` (2.5x faster!)
5. **MutationObserver**: `500ms` → `100ms` (5x faster!)

### After Fix:
```javascript
// Delay 1: Initial widget injection (100ms)
setTimeout(() => {
  this.injectShadowRankWidget();
}, 100); // ✅ 30x faster!

// Delay 2: NO WAIT - Check immediately!
const membersList = document.querySelector('[class*="members"]');

// Delay 3: Fast retry (200ms)
setTimeout(() => this.injectShadowRankWidget(), 200); // ✅ 10x faster!

// Total: 100ms + 0ms = 100ms (near instant!)
```

## Speed Improvements

| Operation | Before | After | Speed Gain |
|-----------|--------|-------|------------|
| **Initial injection** | 3000ms | 100ms | **30x faster** ⚡ |
| **Member list wait** | 2000ms | 0ms | **Instant** ⚡⚡⚡ |
| **Retry delay** | 2000ms | 200ms | **10x faster** ⚡ |
| **Channel switch** | 500ms | 200ms | **2.5x faster** ⚡ |
| **MutationObserver** | 500ms | 100ms | **5x faster** ⚡ |
| **Total time** | **~5000ms** | **~100ms** | **50x faster!** 🚀 |

## Why This Works

### 1. **BdApi.DOM is Instant** ✅
```javascript
// CSS injection is now instant (no delay needed)
BdApi.DOM.addStyle('shadow-army-widget-styles', cssContent);
```
- Persistent across Discord reloads
- No waiting required
- BetterDiscord handles everything

### 2. **Smart Member List Detection** ✅
```javascript
// Check immediately (no artificial delay)
const membersList = document.querySelector('[class*="members"]');
if (!membersList) {
  // Fast retry only if needed
  setTimeout(() => this.injectShadowRankWidget(), 200);
  return;
}
```
- Instant check when member list is ready
- Fast retry only when necessary
- No more blanket 2-second waits

### 3. **Optimized Retry Logic** ✅
```javascript
// Before: 2000ms blanket wait (always!)
await new Promise(resolve => setTimeout(resolve, 2000));

// After: No wait, instant check!
const membersList = document.querySelector('[class*="members"]');
```
- No unnecessary waiting
- Check immediately
- Retry only if needed (and fast!)

### 4. **Fast Debouncing** ✅
```javascript
// Before: 500ms debounce
setTimeout(() => this.injectShadowRankWidget(), 500);

// After: 100ms debounce (5x faster)
setTimeout(() => this.injectShadowRankWidget(), 100);
```
- Still prevents spam
- Much more responsive
- Better user experience

## Real-World Impact

### Scenario 1: Plugin Start
**Before**: Wait 5 seconds → Widget appears
**After**: Wait 0.1 seconds → Widget appears ⚡

### Scenario 2: Channel Switch
**Before**: Switch channel → Wait 0.5s → Widget appears
**After**: Switch channel → Wait 0.2s → Widget appears ⚡

### Scenario 3: Guild Switch
**Before**: Switch guild → Wait 0.5s → Widget appears
**After**: Switch guild → Wait 0.1s → Widget appears ⚡

### Scenario 4: Member List Re-render
**Before**: Discord updates → Wait 0.5s → Widget appears
**After**: Discord updates → Wait 0.1s → Widget appears ⚡

## Technical Details

### Changes Made

1. **`start()` method**:
   ```javascript
   // Before
   setTimeout(() => this.injectShadowRankWidget(), 3000);
   
   // After
   setTimeout(() => this.injectShadowRankWidget(), 100);
   ```

2. **`injectShadowRankWidget()` method**:
   ```javascript
   // Before
   await new Promise(resolve => setTimeout(resolve, 2000));
   const membersList = document.querySelector('[class*="members"]');
   if (!membersList) setTimeout(() => ..., 2000);
   
   // After
   // No wait!
   const membersList = document.querySelector('[class*="members"]');
   if (!membersList) setTimeout(() => ..., 200);
   ```

3. **`setupChannelWatcher()` method**:
   ```javascript
   // Before
   setTimeout(() => { ... }, 500);
   
   // After
   setTimeout(() => { ... }, 200);
   ```

4. **`setupMemberListWatcher()` method**:
   ```javascript
   // Before
   setTimeout(() => this.injectShadowRankWidget(), 500);
   
   // After
   setTimeout(() => this.injectShadowRankWidget(), 100);
   ```

## Why So Fast Now?

### 🚀 BdApi.DOM Benefits:
- ✅ **Instant CSS injection** - No delay needed
- ✅ **Persistent** - Works immediately after Discord loads
- ✅ **Framework-aware** - BetterDiscord handles timing

### ⚡ Smart Retry Logic:
- ✅ **Check immediately** - No artificial waits
- ✅ **Fast retries** - Only 200ms if needed
- ✅ **Minimal debounce** - 100ms instead of 500ms

### 🎯 Result:
- **Widget appears in ~100ms** instead of 5000ms
- **50x faster** overall
- **Feels instant** to users
- **Still stable** with retries if needed

## Testing

✅ **Plugin start**: Widget appears instantly
✅ **Channel switch**: Widget re-appears in 0.2s
✅ **Guild switch**: Widget re-appears in 0.1s
✅ **Member list re-render**: Widget recovers in 0.1s
✅ **No duplicates**: Debouncing still works perfectly
✅ **No errors**: Linter passes all checks

## Files Modified

- `plugins/ShadowArmy.plugin.js`
  - Reduced initial delay: 3000ms → 100ms
  - Removed member list wait: 2000ms → 0ms (instant check)
  - Reduced retry delay: 2000ms → 200ms
  - Reduced channel switch delay: 500ms → 200ms
  - Reduced MutationObserver delay: 500ms → 100ms

## Summary

The Shadow Army widget now appears **virtually instantly** (100ms) thanks to:

1. ✅ **BdApi.DOM** - Instant, persistent CSS injection
2. ✅ **Smart detection** - No artificial delays
3. ✅ **Fast retries** - Only when needed
4. ✅ **Optimized timing** - Minimal debounce

**Result**: **50x faster** widget appearance! 🚀
