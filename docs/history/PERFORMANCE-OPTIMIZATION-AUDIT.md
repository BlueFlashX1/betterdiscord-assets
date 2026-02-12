# BetterDiscord Performance Optimization Audit

**Status**: Documentation Complete - Ready for Future Optimization  
**Date**: 2025-01-21  
**Purpose**: Comprehensive catalog of performance bottlenecks found via static analysis

---

## Summary Statistics

| Pattern Type | Count | Priority | Impact |
|-------------|-------|----------|--------|
| Chained Array Methods | 5 | HIGH | Creates intermediate arrays |
| DOM Query Calls | 100+ | HIGH | Repeated expensive queries |
| Frequent Settings Saves | 179 | MEDIUM | I/O overhead, blocking |
| String Concatenation in Loops | 50 | MEDIUM | Creates temporary strings |
| Regex Compilation in Loops | 35 | MEDIUM | Compiles regex repeatedly |
| Repeated Property Access | 83 | LOW | Property lookup overhead |
| Observer Instances | 20 | MEDIUM | Multiple observers overhead |
| Array.from() Usage | 23 | LOW | Generally fine, review context |

---

## 1. Chained Array Methods (5 instances)

### Problem

Chaining `.filter().map()` or `.map().filter()` creates intermediate arrays, wasting memory and CPU.

### Instances Found

#### Dungeons.plugin.js

```javascript
// Line 6002
(aliveMobs || []).map((mob) => [this.getEnemyKey(mob, 'mob'), mob]).filter(([id]) => id)

// Line 6469
const normalizedAssigned = assigned.map((s) => this.normalizeShadowId(s)).filter(Boolean);

// Line 10020
allShadows.map((s) => [this.getShadowIdValue(s), s]).filter(([id]) => !!id)
```

#### CSSPicker.plugin.js

```javascript
// Line 365
return Array.from(new Set(selectors)).filter(Boolean).slice(0, 8);
```

#### CriticalHit.plugin.js

```javascript
// Line 2745
channelCrits.map((entry) => this.normalizeId(entry.messageId)).filter(Boolean)
```

### Safe Optimization Strategy

```javascript
// ❌ BEFORE: Creates intermediate arrays
const result = items.map(x => transform(x)).filter(Boolean);

// ✅ AFTER: Single pass, no intermediate arrays
const result = [];
for (const item of items) {
  const transformed = transform(item);
  if (transformed) result.push(transformed);
}

// Alternative: Use reduce for functional style
const result = items.reduce((acc, item) => {
  const transformed = transform(item);
  if (transformed) acc.push(transformed);
  return acc;
}, []);
```

### Risk Level: **LOW** (Behaviorally equivalent, just faster)

---

## 2. DOM Query Calls (100+ instances)

### Problem

Repeated `querySelector`/`querySelectorAll` calls are expensive. Many queries happen in hot paths (message processing, UI updates).

### Instances Found

#### Most Impactful Files

- `Dungeons.plugin.js`: 58+ queries
- `SoloLevelingStats.plugin.js`: 28+ queries (note: already has DOM cache system)
- `CriticalHit.plugin.js`: 15+ queries

### Patterns Found

1. **Queries in loops** (worst case):

```javascript
// Line 9672-9673 (Dungeons.plugin.js)
document.querySelectorAll(`[data-arise-button="${channelKey}"]`).forEach(...)
document.querySelectorAll('.dungeon-arise-button').forEach(...)
```

2. **Repeated queries in same function**:

```javascript
// Lines 10360-10361 (Dungeons.plugin.js)
const fillEl = hpBar.querySelector('.hp-bar-fill');
const textEl = hpBar.querySelector('.hp-bar-text');
// These should be cached if hpBar is reused
```

3. **Queries without caching**:

```javascript
// Lines 3411-3417 (Dungeons.plugin.js) - In a loop/hot path
const element = document.querySelector(sel);
const hasMessages = element.querySelector('[class*="message"]') !== null;
```

### Safe Optimization Strategy

#### Pattern 1: Cache queries at initialization

```javascript
// ❌ BEFORE: Queries every time
updateUI() {
  const element = document.querySelector('.target');
  element.textContent = 'updated';
}

// ✅ AFTER: Cache once
constructor() {
  this.cachedElements = {};
}

init() {
  this.cachedElements.target = document.querySelector('.target');
}

updateUI() {
  this.cachedElements.target.textContent = 'updated';
}
```

#### Pattern 2: Scope queries to containers

```javascript
// ❌ BEFORE: Global query
const children = document.querySelectorAll('.child');

// ✅ AFTER: Scoped query
const container = this.cachedContainer; // Cached once
const children = container.querySelectorAll('.child');
```

#### Pattern 3: Batch queries when possible

```javascript
// ❌ BEFORE: Multiple queries
const el1 = document.querySelector('.el1');
const el2 = document.querySelector('.el2');
const el3 = document.querySelector('.el3');

// ✅ AFTER: Query once, traverse
const container = document.querySelector('.container');
const el1 = container.querySelector('.el1');
const el2 = container.querySelector('.el2');
const el3 = container.querySelector('.el3');
```

### Note: SoloLevelingStats.plugin.js already implements DOM caching (see line 107 comment: "DOM Caching System: Eliminates 84 querySelector calls per update")

### Risk Level: **MEDIUM** (Need to ensure elements exist before caching)

---

## 3. Frequent Settings Saves (179 instances)

### Problem

Calling `saveSettings()` or `BdApi.Data.save()` on every change causes I/O overhead and can block the main thread.

### Instances Found

- `Dungeons.plugin.js`: 55+ saves
- `ShadowArmy.plugin.js`: 48+ saves
- `CriticalHit.plugin.js`: 43+ saves
- `SoloLevelingStats.plugin.js`: 19+ saves
- Others: 14+ saves

### Patterns Found

1. **Immediate save after every change**:

```javascript
// Line 2177 (Dungeons.plugin.js)
this.saveSettings();

// Line 2434 (Dungeons.plugin.js)
this.saveSettings();

// Line 2545 (Dungeons.plugin.js)
this.saveSettings();
```

2. **Save in hot paths** (combat updates, message processing):

```javascript
// Lines 8373, 8584, 8784 (Dungeons.plugin.js) - In combat loops
this.saveSettings();
```

3. **Multiple saves in sequence**:

```javascript
// Lines 8987-9047 (CriticalHit.plugin.js) - 7 saves in a row
this.saveSettings();
// ... other code ...
this.saveSettings();
```

### Safe Optimization Strategy

#### Implement debounced save

```javascript
// Add to constructor
constructor() {
  this._savePending = false;
  this._saveTimer = null;
}

// Debounced save (300ms delay)
debouncedSave() {
  if (this._saveTimer) {
    clearTimeout(this._saveTimer);
  }
  this._savePending = true;
  this._saveTimer = setTimeout(() => {
    if (this._savePending) {
      this.saveSettings();
      this._savePending = false;
    }
  }, 300);
}

// For critical saves (immediate)
saveSettingsImmediate() {
  this._savePending = false;
  if (this._saveTimer) {
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
  }
  this.saveSettings();
}
```

#### Migration Strategy

- Replace non-critical `saveSettings()` calls with `debouncedSave()`
- Keep `saveSettings()` (immediate) for critical operations (plugin stop, user-initiated actions)
- Batch multiple rapid changes (use `debouncedSave()`)

### Risk Level: **LOW** (Debouncing is safe, just delays persistence by 300ms)

---

## 4. String Concatenation in Loops (50 instances)

### Problem

Using `+=` for string concatenation in loops creates many temporary strings, causing GC pressure.

### Instances Found

#### Dungeons.plugin.js (most instances)

```javascript
// Lines 11066-11149 - Building HTML strings
headerHTML += '<div class="...">';
headerHTML += '<span>...</span>';
headerHTML += '</div>';
listHTML += '<div>...</div>';
```

### Safe Optimization Strategy

```javascript
// ❌ BEFORE: String concatenation
let html = '';
items.forEach(item => {
  html += `<div>${item.name}</div>`;
});

// ✅ AFTER: Array join
const htmlParts = [];
items.forEach(item => {
  htmlParts.push(`<div>${item.name}</div>`);
});
const html = htmlParts.join('');

// Or with map
const html = items.map(item => `<div>${item.name}</div>`).join('');
```

### Risk Level: **LOW** (Functionally identical, just faster)

---

## 5. Regex Compilation in Loops (35 instances)

### Problem

Creating regex patterns inside loops or calling `.match()`/`.test()` with inline regex compiles the pattern repeatedly.

### Instances Found

#### SoloLevelingStats.plugin.js

```javascript
// Lines 680-683 - Regex in hot path
const hasLinks = /https?:\/\//.test(messageText);
const hasCode = /```|`/.test(messageText);
const hasMentions = /<@|@everyone|@here/.test(messageText);

// Lines 691-709 - Multiple regex matches
const words = messageText.toLowerCase().match(/\b\w+\b/g) || [];
if (messageText.match(/^[A-Z].*[.!?]$/)) bonus += 3;
if (messageText.match(/^\d+[\.\)]\s/)) bonus += 5;
if (messageText.match(/^[-*]\s/m)) bonus += 5;
```

#### CriticalHit.plugin.js

```javascript
// Lines 424-436 - Regex for ID validation (called frequently)
return id ? /^\d{17,19}$/.test(String(id).trim()) : false;
if (/^\d{17,19}$/.test(normalized)) return normalized;
const match = normalized.match(/\d{17,19}/);
```

### Safe Optimization Strategy

```javascript
// ❌ BEFORE: Regex compiled every call
function validateId(id) {
  return /^\d{17,19}$/.test(String(id).trim());
}

// ✅ AFTER: Regex compiled once (module/class level)
const DISCORD_ID_REGEX = /^\d{17,19}$/;

function validateId(id) {
  return DISCORD_ID_REGEX.test(String(id).trim());
}

// For multiple patterns used in hot paths
class MessageProcessor {
  constructor() {
    // Compile once, reuse many times
    this.regexPatterns = {
      links: /https?:\/\//,
      code: /```|`/,
      mentions: /<@|@everyone|@here/,
      words: /\b\w+\b/g,
      sentence: /^[A-Z].*[.!?]$/,
      numberedList: /^\d+[\.\)]\s/,
      bulletList: /^[-*]\s/m,
      discordId: /^\d{17,19}$/,
    };
  }

  processMessage(text) {
    const hasLinks = this.regexPatterns.links.test(text);
    const hasCode = this.regexPatterns.code.test(text);
    // etc.
  }
}
```

### Risk Level: **LOW** (Just moves regex compilation to initialization)

---

## 6. Repeated Property Access (83 instances)

### Problem

Accessing `this.settings.property` multiple times in loops causes repeated property lookups.

### Instances Found

```javascript
// Lines 2812-2838 (Dungeons.plugin.js)
if (!this.settings.userMaxHP || this.settings.userMaxHP === null) {
  // ... later ...
  if (!this.settings.userHP || this.settings.userHP === null) {
    this.settings.userHP = this.settings.userMaxHP;
  }
}
if (!this.settings.userMaxMana || this.settings.userMaxMana === null) {
  // ... later ...
  if (!this.settings.userMana || this.settings.userMana === null) {
    this.settings.userMana = this.settings.userMaxMana;
  }
}
```

### Safe Optimization Strategy

```javascript
// ❌ BEFORE: Repeated property access
if (!this.settings.userMaxHP || this.settings.userMaxHP === null) {
  this.settings.userHP = this.settings.userMaxHP;
}

// ✅ AFTER: Cache property once
const { userMaxHP, userHP, userMaxMana, userMana } = this.settings;
if (!userMaxHP || userMaxHP === null) {
  this.settings.userHP = userMaxHP;
}

// For hot loops, cache at function start
function processCombat() {
  const { userHP, userMaxHP, userMana, userMaxMana } = this.settings;
  // Use cached variables throughout function
}
```

### Risk Level: **VERY LOW** (Micro-optimization, but safe)

---

## 7. Observer Instances (20 instances)

### Problem

Creating multiple `MutationObserver` or `IntersectionObserver` instances when one could observe multiple targets.

### Instances Found

- `Dungeons.plugin.js`: 3 observers
- `SoloLevelingStats.plugin.js`: 4 observers
- `CriticalHit.plugin.js`: 8 observers (most instances)
- Others: 5 observers

### Patterns Found

```javascript
// Line 3481 (Dungeons.plugin.js)
this.messageObserver = new MutationObserver((mutations) => { ... });

// Line 10974 (Dungeons.plugin.js)
this.toolbarObserver = new MutationObserver(() => { ... });

// Line 12086 (Dungeons.plugin.js)
const headerObserver = new MutationObserver(() => { ... });
```

### Safe Optimization Strategy

#### Pattern 1: Reuse observers for related targets

```javascript
// ❌ BEFORE: Separate observer for each target
this.observer1 = new MutationObserver(callback1);
this.observer2 = new MutationObserver(callback2);
observer1.observe(el1);
observer2.observe(el2);

// ✅ AFTER: One observer, multiple targets
this.observer = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    if (mutation.target === el1) callback1(mutation);
    if (mutation.target === el2) callback2(mutation);
  });
});
this.observer.observe(el1);
this.observer.observe(el2);
```

#### Pattern 2: Consolidate related observers

```javascript
// ✅ BETTER: Separate observers only if callbacks are unrelated
// (Current implementation is likely fine, but review if callbacks are similar)
```

### Risk Level: **MEDIUM** (Consolidation may change timing/callback behavior)

---

## 8. Array.from() Usage (23 instances)

### Problem

Most `Array.from()` usage is fine, but review for context.

### Instances Found

- `ShadowArmy.plugin.js`: 4 instances
- `Dungeons.plugin.js`: 4 instances
- `SoloLevelingStats.plugin.js`: 3 instances
- Others: 12 instances

### Review Needed

Most uses appear reasonable (creating arrays from Set, length, etc.), but review:

- Lines where `Array.from()` is chained with other methods
- Lines where `Array.from()` is in hot paths (loops, frequent calls)

### Safe Optimization Strategy

```javascript
// If Array.from() is only for creating array of length N:
// ❌ BEFORE
Array.from({ length: count }, (_, i) => createItem(i))

// ✅ AFTER (if count is small, pre-allocated array is faster)
const arr = new Array(count);
for (let i = 0; i < count; i++) {
  arr[i] = createItem(i);
}

// But Array.from() is fine for most cases - only optimize if in hot path
```

### Risk Level: **VERY LOW** (Generally fine as-is)

---

## Implementation Priority

### Phase 1: High Impact, Low Risk

1. ✅ **Chained Array Methods** (5 instances) - Easy wins
2. ✅ **String Concatenation** (50 instances) - Clear pattern, safe change
3. ✅ **Regex Compilation** (35 instances) - Move to class/module level

### Phase 2: Medium Impact, Medium Risk

4. ⚠️ **DOM Query Caching** (100+ instances) - Need careful testing
5. ⚠️ **Frequent Settings Saves** (179 instances) - Implement debouncing

### Phase 3: Lower Impact, Low Risk

6. ✅ **Repeated Property Access** (83 instances) - Micro-optimization
7. ⚠️ **Observer Consolidation** (20 instances) - Review callback behavior

### Phase 4: Review Only

8. 📋 **Array.from() Usage** (23 instances) - Review context, mostly fine

---

## Testing Strategy

### Before Optimization

1. Profile current performance (if possible)
2. Note any timing-sensitive behavior
3. Document critical save points (immediate saves needed)

### During Optimization

1. Optimize one pattern type at a time
2. Test after each pattern
3. Verify behavior is unchanged

### After Optimization

1. Verify all plugins still work correctly
2. Test edge cases (rapid changes, plugin stop during save, etc.)
3. Monitor for any performance regressions

---

## Notes

- **SoloLevelingStats.plugin.js** already has DOM caching system (see line 107)
- **CriticalHit.plugin.js** already has debounced save (see line 2048 comment)
- Many saves in `Dungeons.plugin.js` are during combat - consider batching
- Some regex patterns are already compiled (good), but many inline patterns remain

---

## Future Considerations

1. **Consider using WeakMap for DOM element caching** (prevents memory leaks if elements are removed)
2. **Batch DOM reads/writes** (separate read phase from write phase)
3. **Use requestAnimationFrame for UI updates** (smooth 60fps updates)
4. **Consider Web Workers for heavy computations** (if combat calculations become too heavy)

---

**End of Audit**
