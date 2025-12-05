# Debug Panel Implementation Plan

## Goal

Create a settings panel at the bottom with debug mode toggle that controls all debug console logs.

---

## Functional Approach (NO IF-ELSE!)

### 1. Debug Console Helper (Functional)

```javascript
// FUNCTIONAL: Conditional logging without if-else
debugConsole(prefix, message, data = {}) {
  const log = () => console.log(`${prefix}`, message, data);
  return this.settings.debugMode && log();  // ✅ Short-circuit!
};
```

**Usage:**
```javascript
// Instead of:
console.log('💾 [SAVE] Successfully saved', data);

// Use:
this.debugConsole('💾 [SAVE]', 'Successfully saved', data);
```

### 2. Settings Panel (Functional)

```javascript
getSettingsPanel() {
  const container = document.createElement('div');
  container.style.cssText = 'padding: 20px;';
  
  // Debug toggle
  const debugToggle = this.createToggle(
    'Debug Mode',
    'Show detailed console logs for troubleshooting',
    this.settings.debugMode || false,
    (value) => this.withAutoSave(() => {
      this.settings.debugMode = value;
      console.log('🔧 Debug mode:', value ? 'ENABLED' : 'DISABLED');
    }, true)
  );
  
  container.appendChild(debugToggle);
  return container;
}
```

### 3. Toggle Creator (Functional Helper)

```javascript
createToggle(label, description, defaultValue, onChange) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin-bottom: 20px;';
  
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = defaultValue;
  toggle.addEventListener('change', (e) => onChange(e.target.checked));
  
  // Label and description
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  
  const desc = document.createElement('div');
  desc.textContent = description;
  desc.style.cssText = 'font-size: 12px; color: #888; margin-top: 5px;';
  
  wrapper.appendChild(toggle);
  wrapper.appendChild(labelEl);
  wrapper.appendChild(desc);
  
  return wrapper;
}
```

---

## Implementation Steps

1. Add `debugMode` to defaultSettings
2. Create `debugConsole()` helper
3. Replace all `console.log` debug statements
4. Create `createToggle()` helper
5. Create `getSettingsPanel()` with debug toggle

---

## Console Log Patterns to Replace

Find all:
- `console.log('🔧 [CONSTRUCTOR]', ...)`
- `console.log('💾 [LOAD]', ...)`
- `console.log('💾 [SAVE]', ...)`
- `console.log('✅ [SAVE]', ...)`
- `console.log('💾 [PERIODIC]', ...)`
- `console.log('🌟 [SHADOW XP]', ...)`

Replace with:
- `this.debugConsole('🔧 [CONSTRUCTOR]', ..., data)`

---

## Benefits

✅ NO if-else statements (short-circuit evaluation)
✅ Toggle debug mode via settings panel
✅ Clean console in production
✅ Detailed logs when debugging
✅ Functional programming style
✅ Auto-saves when debug mode changes

