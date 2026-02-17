# React Patcher Migration Plan

> **Status**: PLAN ONLY — Do not implement until approved
> **Created**: February 17, 2026
> **Backup**: `plugins/_backups/20260217_041646/`
> **Scope**: Migrate raw DOM injection → React patcher pattern across Solo Leveling BD plugins

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Current Architecture](#current-architecture)
3. [Target Architecture](#target-architecture)
4. [Migration Priority Matrix](#migration-priority-matrix)
5. [Phase 1: SoloLevelingUtils Enhancement](#phase-1-sololevelingutils-enhancement)
6. [Phase 2: ShadowExchange Migration](#phase-2-shadowexchange-migration)
7. [Phase 3: ChatNavArrows Migration](#phase-3-chatnavarrows-migration)
8. [Phase 4: HSLDockAutoHide Stabilization](#phase-4-hsldockautohide-stabilization)
9. [Phase 5: CriticalHit & Dungeons (Transient Overlays)](#phase-5-criticalhit--dungeons-transient-overlays)
10. [Phase 6: SoloLevelingToasts Audit](#phase-6-sololevelingtoasts-audit)
11. [Shared Patterns & Conventions](#shared-patterns--conventions)
12. [Risk Assessment](#risk-assessment)
13. [Testing Strategy](#testing-strategy)
14. [Rollback Plan](#rollback-plan)

---

## Problem Statement

**9 of 14 plugins** use raw DOM injection (`document.createElement` + `appendChild`) to insert UI elements. When Discord's React reconciler re-renders, it destroys any DOM nodes it doesn't own — causing injected elements to vanish. Plugins then rely on `MutationObserver` to re-inject, creating a cat-and-mouse race condition.

**Symptoms observed:**
- ShadowExchange swirl icon disappears on navigation (workaround: `document.body` fixed position)
- ChatNavArrows uses `MutationObserver` on `document.body` with `subtree: true` (performance tax)
- Dungeons HP bars injected into message containers get destroyed on re-render
- CriticalHit overlays on messages are ephemeral by nature but still fight React

**Root cause:** Injecting raw DOM into React-managed containers. React owns those nodes and will destroy/recreate them.

---

## Current Architecture

### Injection Pattern Categories

| Category | Pattern | Plugins | Risk |
|----------|---------|---------|------|
| **React Patcher** | `BdApi.Patcher.after()` on MainContent `'Z'` | LevelProgressBar (via SLUtils), SoloLevelingStats (inline), ShadowArmy (inline) | ✅ Safe |
| **Function Patcher** | `BdApi.Patcher.after()` on stores/actions | CriticalHit (sendMessage), SoloLevelingStats (receiveMessage), SoloLevelingToasts (showNotification) | ✅ Safe (non-UI) |
| **Toolbar DOM** | `createElement` + `appendChild` into chat toolbar | SkillTree, TitleManager | ⚠️ MutationObserver re-inject |
| **Body-level DOM** | `document.body.appendChild()` with `position: fixed` | ShadowExchange (icon + panel), HSLDockAutoHide (alert rail), SoloLevelingToasts | ⚠️ Works but fragile |
| **React-tree DOM** | `createElement` + `appendChild` inside React containers | ChatNavArrows (message wrapper), Dungeons (message elements), CriticalHit (transient only) | ❌ Breaks on re-render |
| **CSS-only** | `BdApi.DOM.addStyle` / class manipulation | CSSPicker, UserPanelDockMover, HSLWheelBridge | ✅ Safe |

### DOM Injection Counts by Plugin

| Plugin | `createElement` | `appendChild` | `innerHTML=` | `MutationObserver` | `position: fixed` |
|--------|-----------------|---------------|--------------|--------------------|--------------------|
| CriticalHit | ~20 | ~15 | ~10 | Yes | Yes (overlays) |
| Dungeons | ~25 | ~20 | ~15 | Yes | Yes (overlays) |
| ShadowExchange | ~5 | ~3 | ~5 | Yes | Yes (icon + panel) |
| ChatNavArrows | ~3 | ~2 | ~1 | Yes (body subtree!) | No |
| HSLDockAutoHide | ~2 | ~1 | ~1 | Yes | Yes (rail) |
| SoloLevelingToasts | ~3 | ~2 | ~2 | No | Yes |

---

## Target Architecture

### The Gold Standard: SLUtils.tryReactInjection()

Already exists in `SoloLevelingUtils.js` and is used by LevelProgressBar. The pattern:

```
1. Find Discord's MainContent component via BdApi.Webpack.getByStrings('baseLayer')
2. Patch its render function with BdApi.Patcher.after()
3. Use BdApi.Utils.findInTree() to locate injection point in React tree
4. Insert React.createElement() into children array
5. Wait 100ms for DOM render, then call onMount callback
6. On stop(): BdApi.Patcher.unpatchAll(patcherId)
```

**Key properties:**
- Element survives Discord re-renders (it's IN the React tree)
- Duplicate injection prevention via `findInTree` check
- Clean lifecycle: patch on start, unpatch on stop
- DOM reference available via `onMount` for imperative updates

### What Should NOT Use React Patcher

Not everything needs migration. These are **exempt**:

| Type | Reason | Examples |
|------|--------|---------|
| Transient overlays (< 3s) | Self-removing animations, don't need React persistence | CriticalHit damage numbers, Dungeons arise animations |
| Toast notifications | Self-contained, body-level, auto-dismiss | SoloLevelingToasts |
| CSS injection | Already safe, `BdApi.DOM.addStyle` is the correct API | All plugins |
| Context menu patches | Already uses `BdApi.ContextMenu.patch` (correct API) | ShadowExchange |

### What MUST Use React Patcher

| Element | Current Pattern | Why It Must Migrate |
|---------|----------------|---------------------|
| ShadowExchange swirl icon | `document.body` + fixed position | Should live in LPB container (React-managed) |
| ShadowExchange panel | `document.body` + fixed overlay | OK as body-level, but creation should use React portal |
| ChatNavArrows buttons | `appendChild` into `messagesWrapper_` | React-managed container, arrows get destroyed |
| HSLDockAutoHide alert rail | `document.body` + fixed | OK as body-level, but React injection would be cleaner |
| Dungeons HP bars in messages | `appendChild` into message elements | React re-render destroys them |

---

## Migration Priority Matrix

| Priority | Plugin | Effort | Impact | Risk if Skipped |
|----------|--------|--------|--------|-----------------|
| **P0** | SoloLevelingUtils Enhancement | Small | Foundation for all | Blocks everything |
| **P1** | ShadowExchange | Medium | Swirl icon stability | Icon disappears on nav |
| **P2** | ChatNavArrows | Medium | Arrow persistence | Arrows disappear, MutationObserver perf tax |
| **P3** | HSLDockAutoHide | Small | Alert rail stability | Minor — body injection works |
| **P4** | CriticalHit & Dungeons | Large | HP bar persistence | HP bars flash/disappear |
| **P5** | SoloLevelingToasts | Small | Audit only | Low — body injection works |

---

## Phase 1: SoloLevelingUtils Enhancement

**Goal**: Extend `SoloLevelingUtils.js` with additional shared patterns that Phase 2-5 will use.

### 1.1 Add `tryMessageContainerInjection()` (New)

For plugins that need to inject into per-message containers (CriticalHit, Dungeons, ChatNavArrows). This patches Discord's message renderer rather than the app-level MainContent.

```javascript
/**
 * Patch Discord's message component to inject per-message elements.
 *
 * @param {Object} opts
 * @param {string}   opts.patcherId     - BdApi patcher namespace
 * @param {Function} opts.shouldInject  - (message, channel) => boolean
 * @param {Function} opts.render        - (React, message, channel) => ReactElement | null
 * @param {Function} opts.onMount       - (domElement, message) => void
 * @param {string}   opts.elementClass  - class for duplicate detection
 * @returns {boolean}
 */
function tryMessageContainerInjection(opts) { ... }
```

**Finding the message component:**
```javascript
// Strategy: Find the message component that renders individual messages
// Discord's message component contains strings like 'MESSAGE_ACTIONS' or 'messageListItem'
const MessageComponent = BdApi.Webpack.getByStrings('messageListItem', { defaultExport: false });
// OR use getWithKey for more precise targeting
const [mod, key] = BdApi.Webpack.getWithKey(m => m?.toString?.().includes('messageListItem'));
```

**Why a separate function**: MainContent injection gives ONE element at app root. Message injection needs an element PER message. Different React tree location, different find logic.

### 1.2 Add `createReactPortal()` Helper (New)

For body-level panels that should still benefit from React lifecycle:

```javascript
/**
 * Create a React portal rendered into a body-level container.
 * React manages the component lifecycle while the DOM lives outside React's tree.
 *
 * @param {Object} opts
 * @param {string}   opts.containerId - DOM container id
 * @param {Function} opts.render      - (React) => ReactElement
 * @returns {{ mount: Function, unmount: Function }}
 */
function createReactPortal(opts) { ... }
```

### 1.3 Add `findMessageComponent()` Cache (New)

Webpack module lookups are expensive. Cache the message component reference:

```javascript
let _messageComponentCache = null;

function findMessageComponent() {
  if (_messageComponentCache) return _messageComponentCache;

  // Try multiple search strategies with fallback chain
  _messageComponentCache = BdApi.Webpack.getByStrings('messageListItem', { defaultExport: false })
    || BdApi.Webpack.getByStrings('MESSAGE_CONTENT', { defaultExport: false });

  return _messageComponentCache;
}
```

### 1.4 Version Bump

`SoloLevelingUtils.js` → v2.0.0

### 1.5 Estimated Changes

- **Lines added**: ~120–150
- **Files modified**: 1 (`SoloLevelingUtils.js`)
- **Breaking changes**: None (additive only)

---

## Phase 2: ShadowExchange Migration

**Goal**: Replace `document.body` fixed-position swirl icon with React-injected element inside LPB container.

### Current Approach (What Changes)

```
Current:
  document.body → div#se-swirl-icon (position: fixed, top: 5px, right: 20px)
  document.body → div#se-panel-overlay (position: fixed, full-screen)
  MutationObserver watching for LPB container

Target:
  React tree → injected via SLUtils.tryReactInjection() into LPB bar area
  document.body → panel overlay (stays as body-level, created via createReactPortal)
```

### 2.1 Swirl Icon → React Injection

Replace `injectSwirlIcon()` (currently ~40 lines of DOM manipulation) with:

```javascript
tryReactInjection() {
  const pluginInstance = this;

  return SLUtils.tryReactInjection({
    patcherId: 'ShadowExchange',
    elementId: 'se-swirl-icon',
    render: (React) => React.createElement('div', {
      id: 'se-swirl-icon',
      className: 'se-swirl-icon',
      onClick: () => pluginInstance.togglePanel(),
      title: 'Shadow Exchange',
    }, React.createElement('svg', {
      viewBox: '0 0 24 24',
      width: '14',
      height: '14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
    }, /* SVG paths as React elements */)),
    onMount: (domEl) => {
      pluginInstance.swirlIcon = domEl;
      pluginInstance.debugLog('ICON', 'Swirl icon mounted via React');
    },
    debugLog: (...a) => pluginInstance.debugLog(...a),
    debugError: (...a) => pluginInstance.debugError(...a),
  });
}
```

### 2.2 Panel Overlay — Keep as Body-Level

The waypoint panel is a full-screen overlay (modal). This is **correctly** placed at `document.body`. No migration needed for the panel itself, but we should:

- Add `role="dialog"` and `aria-modal="true"` for accessibility
- Ensure Escape key handler is properly bound/unbound

### 2.3 Remove MutationObserver

Currently: `MutationObserver` watches for LPB container to re-inject icon.
After: React patcher handles persistence. Observer deleted entirely.

### 2.4 Remove Fixed Position Workaround

Currently: Icon uses `position: fixed; top: 5px; right: 20px; z-index: 999998`.
After: Icon is part of React tree, positioned via CSS relative to its container (LPB bar).

### 2.5 Fallback

If `tryReactInjection()` returns `false` (LPB not loaded, MainContent not found), fall back to current `document.body` approach.

### 2.6 Estimated Changes

- **Lines changed**: ~80 (remove DOM injection, add React injection)
- **Lines removed**: ~30 (MutationObserver, fixed positioning CSS)
- **Net delta**: ~+50 lines
- **Files modified**: 1 (`ShadowExchange.plugin.js`)

---

## Phase 3: ChatNavArrows Migration

**Goal**: Replace `MutationObserver` on `document.body` + raw DOM injection into `messagesWrapper_` with React patcher on message list component.

### Current Approach (What Changes)

```
Current:
  MutationObserver(document.body, { childList: true, subtree: true })
    → querySelectorAll('div[class^="messagesWrapper_"]')
    → createElement + appendChild into each wrapper

Target:
  BdApi.Patcher.after() on message list/wrapper component
    → React.createElement arrows as children
    → Scroll listener attached via onMount
```

### 3.1 Find the Message List Component

The message list wrapper is a React component. We need to find it:

```javascript
// Strategy 1: Search for the component that renders messagesWrapper
const MessageListComponent = BdApi.Webpack.getByStrings('messagesWrapper', { defaultExport: false });

// Strategy 2: Search for scroller-related strings
const ScrollerComponent = BdApi.Webpack.getByStrings('scroller_', 'messagesWrapper', { defaultExport: false });
```

### 3.2 Patch Message List Render

```javascript
BdApi.Patcher.after('ChatNavArrows', MessageListComponent, 'Z', (_this, _args, returnValue) => {
  // Find the wrapper div in the return tree
  const wrapper = BdApi.Utils.findInTree(
    returnValue,
    (prop) => prop?.props?.className?.includes('messagesWrapper'),
    { walkable: ['props', 'children'] }
  );

  if (!wrapper?.props) return returnValue;

  // Check duplicate
  const hasArrows = BdApi.Utils.findInTree(
    wrapper,
    (prop) => prop?.props?.className?.includes('sl-chat-nav'),
    { walkable: ['props', 'children'] }
  );
  if (hasArrows) return returnValue;

  // Inject arrow elements
  const downArrow = React.createElement('div', {
    className: 'sl-chat-nav-arrow sl-chat-nav-down',
    title: 'Jump to Present',
    dangerouslySetInnerHTML: { __html: '<svg viewBox="0 0 24 24"><path d="M12 16l-6-6h12l-6 6z" fill="currentColor"/></svg>' },
  });

  const upArrow = React.createElement('div', {
    className: 'sl-chat-nav-arrow sl-chat-nav-up',
    title: 'Jump to Top',
    dangerouslySetInnerHTML: { __html: '<svg viewBox="0 0 24 24"><path d="M12 8l-6 6h12l-6-6z" fill="currentColor"/></svg>' },
  });

  // Append to wrapper children
  if (Array.isArray(wrapper.props.children)) {
    wrapper.props.children.push(downArrow, upArrow);
  }

  return returnValue;
});
```

### 3.3 Scroll Listener Attachment

After React renders the arrows, attach scroll listeners:

```javascript
// In onMount or setTimeout after patch:
setTimeout(() => {
  const arrows = document.querySelectorAll('.sl-chat-nav-arrow');
  arrows.forEach(arrow => {
    // Find nearest scroller and attach listener
    const scroller = arrow.closest('div[class^="messagesWrapper_"]')
      ?.querySelector('div[class^="scroller_"]');
    if (scroller && !scroller._slScrollBound) {
      scroller.addEventListener('scroll', updateVisibility, { passive: true });
      scroller._slScrollBound = true;
    }
  });
}, 150);
```

### 3.4 Key Challenge: Multiple Message Wrappers

Discord can have multiple message wrappers (main chat, threads, search results). The current `patchAll()` handles this by querying all wrappers. The React patcher will fire once per render — but Discord renders the message list component once per wrapper, so the patch naturally handles multiple instances.

### 3.5 Remove MutationObserver

The body-subtree MutationObserver is the **biggest performance issue** in the current plugin. It fires on EVERY DOM mutation anywhere in Discord. Remove entirely.

### 3.6 Estimated Changes

- **Lines changed**: ~100 (full rewrite of injection logic)
- **Lines removed**: ~40 (MutationObserver, DOM query logic)
- **Net delta**: ~+60 lines
- **Files modified**: 1 (`ChatNavArrows.plugin.js`)
- **Risk**: Medium — need to find the correct Webpack module for message list

---

## Phase 4: HSLDockAutoHide Stabilization

**Goal**: Replace hardcoded CSS class selectors with more resilient patterns.

### Current Issue

```javascript
// These WILL break on Discord updates:
const selectors = {
  dockWrap: 'base__5e434',
  dockContent: 'content__5e434',
  appBase: 'base__5e434',
};
```

Discord hashes class names on every build. These selectors are essentially build-specific.

### 4.1 Replace Class Selectors with Aria/Structure Queries

```javascript
// Before (fragile):
const dock = document.querySelector('.base__5e434');

// After (resilient):
const dock = document.querySelector('nav[aria-label="Servers sidebar"]');
// or
const dock = document.querySelector('[class*="guilds_"]');
// or use Webpack to get the actual class name:
const GuildClasses = BdApi.Webpack.getByKeys('guilds', 'base');
const dock = document.querySelector(`.${GuildClasses.base}`);
```

### 4.2 Alert Rail → React Injection (Optional)

The alert rail is a `document.body` fixed element. It works fine as-is. Optional migration to React patcher for consistency:

```javascript
SLUtils.tryReactInjection({
  patcherId: 'HSLDockAutoHide',
  elementId: 'sl-hsl-alert-rail',
  render: (React) => React.createElement('div', {
    id: 'sl-hsl-alert-rail',
    className: 'sl-hsl-alert-rail',
    style: { position: 'fixed', left: 0, top: 0, /* ... */ },
  }),
  onMount: (domEl) => { this.alertRail = domEl; },
});
```

### 4.3 Estimated Changes

- **Lines changed**: ~40 (selector replacements)
- **Lines removed**: ~20 (hardcoded class strings)
- **Files modified**: 1 (`HSLDockAutoHide.plugin.js`)
- **Risk**: Low — primarily selector updates

---

## Phase 5: CriticalHit & Dungeons (Transient Overlays)

**Goal**: Assess which elements need migration vs. which are correctly transient.

### Classification

#### CriticalHit
| Element | Type | Duration | Migrate? |
|---------|------|----------|----------|
| Damage number floaters | Transient animation | ~1-2s | ❌ No — self-removing |
| Critical hit screen flash | Transient overlay | ~0.5s | ❌ No — self-removing |
| Shake effect on messages | CSS class toggle | ~0.3s | ❌ No — class only |
| Message highlight glow | Transient | ~1s | ❌ No — self-removing |

**Conclusion for CriticalHit**: All DOM injections are **intentionally transient** (fire-and-forget animations). They don't need to persist through re-renders. The current approach is actually correct for this use case. **No migration needed.**

#### Dungeons
| Element | Type | Duration | Migrate? |
|---------|------|----------|----------|
| Boss HP bars | Persistent per-message | Until fight ends | ✅ Yes — needs React patcher |
| Arise animation overlay | Transient fullscreen | ~3-5s | ❌ No — self-removing |
| Dungeon completion overlay | Transient fullscreen | ~3-5s | ❌ No — self-removing |
| Loot drop animations | Transient | ~2s | ❌ No — self-removing |

### 5.1 Dungeons HP Bars → Message Patcher

HP bars displayed on messages during boss fights need to persist as long as the fight is active. They currently get destroyed when Discord re-renders messages (e.g., new message arrives, user scrolls).

This is the **hardest migration** because it requires per-message injection via a message component patcher.

**Approach**: Use the `tryMessageContainerInjection()` from Phase 1:

```javascript
SLUtils.tryMessageContainerInjection({
  patcherId: 'Dungeons',
  shouldInject: (message) => this.activeFights.has(message.id),
  render: (React, message) => {
    const fight = this.activeFights.get(message.id);
    if (!fight) return null;
    return React.createElement('div', {
      className: 'sl-dungeon-hp-bar',
      'data-message-id': message.id,
    }, /* HP bar children */);
  },
  elementClass: 'sl-dungeon-hp-bar',
  onMount: (domEl, message) => {
    this.updateHPBar(domEl, message.id);
  },
});
```

### 5.2 Estimated Changes

- **CriticalHit**: 0 lines (no migration needed)
- **Dungeons HP bars**: ~80-100 lines changed
- **Risk**: HIGH — message component patching is complex, must find correct Webpack module

---

## Phase 6: SoloLevelingToasts Audit

**Goal**: Verify current approach is correct, no migration needed.

### Current Approach

SoloLevelingToasts creates toast elements at `document.body` with `position: fixed`. Toasts auto-remove after timeout. This is **the correct pattern** for notifications.

### 6.1 Audit Items

- [ ] Verify toasts clean up on plugin stop (no orphaned DOM)
- [ ] Verify z-index doesn't conflict with other overlays
- [ ] Verify `getBoundingClientRect` positioning is stable
- [ ] Consider using `BdApi.UI.showNotice()` for simpler cases

### 6.2 Estimated Changes

- **Lines changed**: 0 (audit only, possibly minor cleanup)

---

## Shared Patterns & Conventions

### Naming Convention for Patcher IDs

Each plugin uses its class name as the patcher ID. This is already consistent:

| Plugin | Patcher ID |
|--------|-----------|
| LevelProgressBar | `'LevelProgressBar'` |
| SoloLevelingStats | `'SoloLevelingStats'` |
| ShadowExchange | `'ShadowExchange'` |
| ChatNavArrows | `'ChatNavArrows'` |
| HSLDockAutoHide | `'HSLDockAutoHide'` |
| Dungeons | `'Dungeons'` |

### Error Handling Convention

Every patcher callback MUST wrap in try-catch:

```javascript
BdApi.Patcher.after(id, target, method, (_this, _args, ret) => {
  try {
    // ... injection logic
  } catch (error) {
    pluginInstance.debugError('REACT_INJECTION', error);
  }
  return ret;  // ALWAYS return
});
```

Per official docs: "React errors tend to propagate to the root node and show the 'crashed client' screen." A patcher callback that throws will crash Discord.

### Lifecycle Convention

```javascript
start() {
  this.injectCSS();
  this.initWebpackModules();
  this.reactInjectionActive = this.tryReactInjection();
  if (!this.reactInjectionActive) {
    this.fallbackDOMInjection();
  }
}

stop() {
  if (this.reactInjectionActive) {
    BdApi.Patcher.unpatchAll('PluginName');
    this.reactInjectionActive = false;
  }
  this.cleanupDOM();
  this.removeCSS();
}
```

### DOM Reference After React Injection

React injection creates elements in the virtual tree. DOM references are available ~100ms after injection via `onMount`. After that, use `document.getElementById()` for imperative updates.

---

## Risk Assessment

### High Risk Items

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Discord changes MainContent export key (`'Z'`) | Medium | All React injection breaks | SLUtils already has `getByStrings('baseLayer')` + `getByStrings('appMount')` fallback chain |
| Discord changes message component structure | Medium | ChatNavArrows + Dungeons HP bars break | Add multiple fallback search strings, DOM fallback |
| `BdApi.Utils.findInTree` doesn't find injection point | Low | Element not injected | Broad match criteria (`className.includes('app')` + `id === 'app-mount'` + `type === 'body'`) |
| Multiple plugins patch same component | Medium | Conflicts, duplicate injection | Unique `elementId` per plugin, `findInTree` duplicate check |
| Plugin load order matters | Low | SLUtils not available when another plugin starts | SLUtils attached to `window`, check `window.SoloLevelingUtils` with retry |

### Medium Risk Items

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Finding message list Webpack module | Medium | ChatNavArrows migration fails | Multiple search strategies, DOM fallback |
| Performance of multiple `findInTree` calls per render | Low | Render lag | findInTree is fast (shallow walk), and duplicate check prevents re-injection |

### Low Risk Items

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| CSS conflicts after migration | Low | Visual glitch | Same CSS classes, just different injection point |
| Memory leaks from patcher | Very Low | Slow degradation | `unpatchAll()` in `stop()` cleans up |

---

## Testing Strategy

### Per-Phase Verification

Each phase has specific checks:

#### Phase 1 (SLUtils)
- [ ] `window.SoloLevelingUtils.tryMessageContainerInjection` exists
- [ ] `window.SoloLevelingUtils.createReactPortal` exists
- [ ] Existing `tryReactInjection` still works (LPB unaffected)

#### Phase 2 (ShadowExchange)
- [ ] Swirl icon appears in LPB area (not body-level)
- [ ] Click opens panel
- [ ] Navigate to different channel — icon persists (no disappear/reappear flash)
- [ ] Disable/re-enable LPB — icon re-appears
- [ ] Disable ShadowExchange — icon cleanly removed
- [ ] If LPB not loaded — fallback DOM injection works

#### Phase 3 (ChatNavArrows)
- [ ] Up/down arrows appear in message wrapper
- [ ] Arrows visible/hidden based on scroll position
- [ ] Navigate to new channel — arrows appear in new channel
- [ ] Open thread — arrows appear in thread scroller
- [ ] No MutationObserver in DevTools (performance check)
- [ ] DevTools Performance tab: no constant DOM mutation events

#### Phase 4 (HSLDockAutoHide)
- [ ] Dock auto-hide still works
- [ ] Alert rail appears when needed
- [ ] No console errors about missing CSS classes
- [ ] After Discord update: selectors still resolve

#### Phase 5 (Dungeons)
- [ ] HP bars appear on boss fight messages
- [ ] HP bars persist through message list re-render (scroll up/down)
- [ ] HP bars update in real-time during fight
- [ ] HP bars removed when fight ends
- [ ] Arise animations still play (transient, unchanged)

#### Phase 6 (Toasts)
- [ ] Toasts appear and auto-dismiss
- [ ] No orphaned DOM after plugin stop
- [ ] z-index correct relative to other overlays

### Integration Testing

After all phases:
- [ ] Enable all plugins simultaneously — no conflicts
- [ ] `BdApi.Patcher.getPatchesByCaller()` returns expected patches
- [ ] No duplicate patcher IDs
- [ ] Plugin load order doesn't matter (SLUtils loads first via window global)
- [ ] Mirror + deploy scripts work correctly
- [ ] Discord restart — all plugins recover cleanly

---

## Rollback Plan

### Per-Phase Rollback

Each phase is independently rollbackable:

1. **Backup exists** at `plugins/_backups/20260217_041646/`
2. Each phase works on a separate plugin file
3. If a phase fails, restore that single file from backup
4. Other phases remain unaffected

### Full Rollback

```bash
# Restore all plugins from backup
cp plugins/_backups/20260217_041646/*.plugin.js plugins/

# Re-deploy
./scripts/mirror-to-assets.sh
./scripts/deploy-betterdiscord-runtime.sh
```

### Feature Flags (Optional)

For gradual rollout, add a settings toggle:

```javascript
this.settings.useReactInjection = true;  // Can be toggled in settings panel

if (this.settings.useReactInjection) {
  this.reactInjectionActive = this.tryReactInjection();
}
if (!this.reactInjectionActive) {
  this.fallbackDOMInjection();
}
```

---

## Implementation Timeline

| Phase | Effort | Dependencies | Estimated Lines |
|-------|--------|--------------|-----------------|
| Phase 1: SLUtils | 1 session | None | +120-150 lines |
| Phase 2: ShadowExchange | 1 session | Phase 1 | ~80 changed, ~30 removed |
| Phase 3: ChatNavArrows | 1-2 sessions | Phase 1 | ~100 changed, ~40 removed |
| Phase 4: HSLDockAutoHide | 0.5 session | None | ~40 changed |
| Phase 5: Dungeons HP bars | 1-2 sessions | Phase 1 | ~80-100 changed |
| Phase 6: Toasts audit | 0.5 session | None | 0 (audit only) |
| **Total** | **5-7 sessions** | | **~+200 net lines** |

---

## Open Questions

1. **Message component Webpack search**: What exact strings identify Discord's message list component? Need to inspect in DevTools during Phase 3.
2. **Multiple patcher callbacks on same module**: If SoloLevelingStats AND ShadowExchange both patch MainContent via `SLUtils.tryReactInjection()`, they use different `patcherId` values. BdApi supports multiple patches on the same method — but does ordering matter?
3. **SLUtils load order**: If SLUtils.js loads after a plugin that needs it, the plugin's `start()` will fail. Need to verify BetterDiscord's plugin load order or add a retry mechanism.
4. **Dungeons HP bars complexity**: The current HP bar implementation is deeply intertwined with fight state management. May need to decouple rendering from state before migrating.

---

## Self-Review: Gaps & Corrections Found

> Added after reviewing the plan against the actual codebase. These are **critical corrections** to the plan above.

### GAP 1: Missing Plugins — SkillTree & TitleManager Not Addressed

**Discovery**: SkillTree and TitleManager BOTH use raw DOM injection into Discord's **chat toolbar** (the bar with channel name, search, etc.). They use `document.createElement` + `appendChild` + `MutationObserver` to persist.

**What they do:**
- **TitleManager**: Injects a title button into the chat toolbar (before SkillTree button)
- **SkillTree**: Injects a skill tree button into the chat toolbar (after TitleManager, before Apps button)
- Both use `MutationObserver` to detect when Discord removes their button and re-inject

**Why this matters**: The chat toolbar is React-managed. Buttons get destroyed on channel navigation.

**Correction**: Add **Phase 3.5: SkillTree + TitleManager Toolbar Migration**

The toolbar is a different React component from the message list — it needs its own Webpack module search:
```javascript
// Find the toolbar component
const ToolbarComponent = BdApi.Webpack.getByStrings('toolbar', 'search', { defaultExport: false });
```

Both plugins should share a single toolbar patcher (avoid patching the same component twice), similar to how multiple plugins share `MainContent.Z`.

**Option A (Preferred)**: Add `tryToolbarInjection()` to SLUtils, used by both plugins.
**Option B**: Each plugin patches independently with its own patcherId.

**Risk if skipped**: Toolbar buttons continue to flicker on navigation.

---

### GAP 2: SoloLevelingUtils Deployment Gap (CRITICAL BLOCKER)

**Discovery**: `SoloLevelingUtils.js` is **NOT in the deploy script** (`deploy-betterdiscord-runtime.sh`). It exists in the dev folder but never gets deployed to BetterDiscord's runtime plugin folder.

**Current behavior**: LevelProgressBar uses `require(path.join(BdApi.Plugins.folder, 'SoloLevelingUtils.js'))` to load it. This only works if the file was manually copied.

**Impact**: If we make SLUtils the foundation for all migration (Phase 1), but it never deploys, **nothing works**.

**Correction**: Phase 0 (new prerequisite):
1. Add `SoloLevelingUtils.js` to `deploy-betterdiscord-runtime.sh`
2. Add `SoloLevelingUtils.js` to `mirror-to-assets.sh`
3. Verify the `require()` + `window.SoloLevelingUtils` loading pattern works from the runtime folder
4. Consider: should SLUtils be a BD plugin (with `start()/stop()`) or stay as a library loaded via `require()`?

---

### GAP 3: SoloLevelingStats Already Uses React Patcher (Misclassified)

**Discovery**: SoloLevelingStats was listed as needing migration in the original architecture table, but it **already patches `MainContent.Z`** directly (not through SLUtils). It has its own inline implementation.

**Correction**: SoloLevelingStats does NOT need React patcher migration. What it needs is:
1. Migrate from inline `BdApi.Patcher.after()` to `SLUtils.tryReactInjection()` for consistency
2. Replace `dangerouslySetInnerHTML: { __html: renderChatUI() }` with proper `React.createElement` calls

This is a **refactor**, not a migration. Lower priority than the plugins that currently have no React patcher at all.

---

### GAP 4: ShadowArmy Also Uses React Patcher (Undocumented)

**Discovery**: `ShadowArmy.plugin.js` patches `MainContent.Z` for its animation container. This was not mentioned anywhere in the original plan.

**Impact**: That's now **4 plugins** patching `MainContent.Z`:
- LevelProgressBar (via SLUtils)
- SoloLevelingStats (inline)
- ShadowArmy (inline)
- ShadowExchange (would be new, Phase 2)

**Risk**: BdApi supports multiple `after` patches on the same method/module — they chain. But 4+ patches on the same method's return value means each patch modifies `returnValue` sequentially. If one patch corrupts the children array, downstream patches fail.

**Correction**: Add to Risk Assessment:
- **New HIGH risk**: Patch collision on `MainContent.Z`. Mitigation: Each patch checks for its own `elementId` via `findInTree` and only modifies its own element. Never mutate shared state.
- Consider consolidating: Have SLUtils batch all React injections into a SINGLE `MainContent.Z` patch that handles multiple registered elements. This would be a v3.0 redesign of SLUtils.

---

### GAP 5: ShadowExchange Design Decision Was Intentional

**Discovery**: ShadowExchange's icon is on `document.body` **by design**, with a code comment explaining why:

> "The LPB progress bar is entirely React-managed — any child appended to `.lpb-progress-bar` or `#lpb-progress-container` gets destroyed on the next React reconciliation cycle. Instead, the swirl icon lives as its own independent fixed-position element."

**Correction**: Phase 2 should be reframed. The goal is NOT to put the icon inside LPB's container. It's to:
1. Use `SLUtils.tryReactInjection()` to inject the icon as a **sibling** of LPB in the React tree (at the same `bodyPath` level)
2. This gives it React persistence WITHOUT being a child of LPB's container
3. It would have its own `elementId: 'se-swirl-icon'` and its own React element
4. CSS positioning remains `position: fixed` but the DOM node is React-managed

This is a better approach than the original plan suggested.

---

### GAP 6: CriticalHit Patches MessageActions.sendMessage (Patcher Conflict)

**Discovery**: CriticalHit already uses `BdApi.Patcher` — but NOT for React injection. It patches `MessageActions.sendMessage` to intercept sent messages for crit detection.

**Impact**: CriticalHit doesn't need React patcher migration (confirmed — its DOM injection is transient animations). But if we ever need to patch message-related functions, CriticalHit's existing patch must be considered for potential conflicts.

---

### GAP 7: SoloLevelingToasts Patches Notification System

**Discovery**: SoloLevelingToasts uses `BdApi.Patcher` to intercept Discord's notification `showNotification` method. Its DOM injection (toasts) is body-level and transient — correctly handled.

**No correction needed** — just documenting for completeness.

---

### REVISED Priority Matrix (Post-Review)

| Priority | Phase | Plugin(s) | What Changes | Effort |
|----------|-------|-----------|-------------|--------|
| **P0** | Phase 0 | Deploy scripts | Add SLUtils.js to deploy pipeline | 0.5 session |
| **P1** | Phase 1 | SoloLevelingUtils | Add toolbar injection, consolidate patterns | 1 session |
| **P2** | Phase 2 | ShadowExchange | Swirl icon → sibling React injection | 1 session |
| **P3** | Phase 3 | ChatNavArrows | Message list → React patcher | 1-2 sessions |
| **P3.5** | Phase 3.5 (NEW) | SkillTree + TitleManager | Toolbar → React patcher | 1-2 sessions |
| **P4** | Phase 4 | HSLDockAutoHide | Resilient selectors via Webpack | 0.5 session |
| **P5** | Phase 5 | Dungeons | HP bars → message patcher | 1-2 sessions |
| **P6** | Phase 6 | SoloLevelingStats | Refactor to use SLUtils (consistency) | 0.5 session |
| **P7** | Phase 7 | SoloLevelingToasts + CriticalHit | Audit only | 0.5 session |
| | | **Total** | | **7-10 sessions** |

### Key Architectural Decision Needed

**Should SLUtils batch all `MainContent.Z` injections into one patch?**

**Option A: Multiple Independent Patches (Current Plan)**
- Each plugin calls `SLUtils.tryReactInjection()` separately
- BdApi chains 4+ `after` patches on `MainContent.Z`
- Simpler per-plugin, but more patches = more fragility

**Option B: Single Consolidated Patch (Recommended for v3.0)**
- SLUtils maintains a registry of elements to inject
- ONE `BdApi.Patcher.after()` on `MainContent.Z` handles all registered elements
- Plugins call `SLUtils.registerReactElement({ elementId, render, onMount })`
- Single patch iterates the registry and injects all elements
- Pros: One patch, one `findInTree` for body, deterministic order
- Cons: More complex SLUtils, all eggs in one basket

**Recommendation**: Start with Option A (Phases 0-3). Migrate to Option B in a future refactor if we hit patch collision issues with 4+ independent patches.
