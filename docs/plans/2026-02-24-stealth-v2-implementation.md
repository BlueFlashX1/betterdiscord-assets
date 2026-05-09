# Stealth v2.0 — Total Concealment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Overhaul Stealth.plugin.js from polling-based partial stealth to Flux Dispatcher-driven total concealment with read receipt blocking, anti-idle suppression, and all bug fixes.

**Architecture:** Replace 15s status enforcement polling with reactive Flux Dispatcher event subscriptions. Add HTTP-layer patches for read receipt blocking. All stealth features default ON. Uses established `Dispatcher.subscribe(eventName, handler)` / `Dispatcher.unsubscribe(eventName, handler)` pattern from ShadowSenses.

**Tech Stack:** BdApi.Patcher, BdApi.Webpack, Flux Dispatcher (via `Webpack.Stores.UserStore._dispatcher`), React (settings panel)

**Design Doc:** `docs/plans/2026-02-24-stealth-v2-design.md`

**Target File:** `betterdiscord-assets/plugins/Stealth.plugin.js`

**Live Test Location:** `~/Library/Application Support/BetterDiscord/plugins/Stealth.plugin.js`

---

## Task 1: Bug Fixes (Low-Hanging Fruit)

**Files:**
- Modify: `plugins/Stealth.plugin.js:4` (version bump)
- Modify: `plugins/Stealth.plugin.js:14-24` (DEFAULT_SETTINGS)
- Modify: `plugins/Stealth.plugin.js:49-53` (`_suppressEventLog` init)
- Modify: `plugins/Stealth.plugin.js:281` (`_recordSuppressed` wrong category)
- Modify: `plugins/Stealth.plugin.js:583-589` (`setPresence` error swallowed)

**Step 1: Fix DEFAULT_SETTINGS — add new settings, change autoSilentMessages default**

```javascript
const DEFAULT_SETTINGS = {
  enabled: true,
  suppressTyping: true,
  invisibleStatus: true,
  suppressActivities: true,
  suppressTelemetry: true,
  disableProcessMonitor: true,
  autoSilentMessages: true,
  suppressReadReceipts: true,
  suppressIdle: true,
  restoreStatusOnStop: true,
  showToasts: true,
};
```

Changes:
- `autoSilentMessages`: `false` → `true`
- Add `suppressReadReceipts: true`
- Add `suppressIdle: true`

**Step 2: Fix `_suppressEventLog` — add missing `silent` and new categories**

In constructor (line 49-53), change:

```javascript
this._suppressEventLog = {
  typing: 0,
  activities: 0,
  telemetry: 0,
  readReceipts: 0,
  idle: 0,
  silent: 0,
};
```

**Step 3: Fix wrong `_recordSuppressed` in `_patchAutoSilentMessages`**

Line 281: change `this._recordSuppressed("activities")` → `this._recordSuppressed("silent")`

**Step 4: Fix `setPresence` error swallowing**

In `_setStatus()` (line 583-589), change the inner try-catch to log the error:

```javascript
if (fnName === "setPresence") {
  try {
    module[fnName].call(module, { status });
  } catch (presenceError) {
    this._logWarning("STATUS", `setPresence({status}) failed, trying plain string`, presenceError, "status-presence-obj");
    module[fnName].call(module, status);
  }
  return true;
}
```

**Step 5: Add `stopTyping` to suppression**

In `_patchTypingIndicators()`, after the primary `startTyping` patch (line 136-153), add a matching `stopTyping` patch:

```javascript
if (typingModule && typeof typingModule.stopTyping === "function") {
  BdApi.Patcher.instead(
    STEALTH_PLUGIN_ID,
    typingModule,
    "stopTyping",
    (ctx, args, original) => {
      if (this.settings.enabled && this.settings.suppressTyping) {
        return undefined;
      }
      return original.apply(ctx, args);
    }
  );
  patched += 1;
}
```

Also add `"stopTyping"` to the `fnNames` array (line 155-160):

```javascript
const fnNames = [
  "sendTyping",
  "sendTypingStart",
  "triggerTyping",
  "startTypingNow",
  "stopTyping",
];
```

**Step 6: Bump version**

Line 4: `@version 1.1.2` → `@version 2.0.0`

Line 2: Update description:

```
@description Total concealment: suppress typing, force invisible, block read receipts, suppress idle detection, hide activities, erase telemetry, and neutralize tracking.
```

**Step 7: Copy to BD plugins folder and verify plugin loads**

```bash
cp betterdiscord-assets/plugins/Stealth.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
```

Open Discord → Settings → Plugins → verify Stealth v2.0.0 loads without errors. Check DevTools console for any `[Stealth]` warnings.

**Step 8: Commit**

```bash
git add plugins/Stealth.plugin.js
git commit -m "fix(stealth): fix 5 bugs — wrong suppression category, missing stopTyping, error swallowing, missing counters"
```

---

## Task 2: Flux Dispatcher Integration

**Files:**
- Modify: `plugins/Stealth.plugin.js` — constructor, `start()`, `stop()`, new `_initDispatcher()`, new `_subscribeFluxEvents()`, new `_unsubscribeFluxEvents()`

**Step 1: Add Dispatcher state to constructor**

After line 34 (`this._processMonitorPatched = false;`), add:

```javascript
this._Dispatcher = null;
this._dispatcherPollTimer = null;
this._fluxHandlers = new Map();
```

**Step 2: Add `_initDispatcher()` method**

Add after `_initStores()` method (after line 119):

```javascript
_initDispatcher() {
  const { Webpack } = BdApi;

  // Proven acquisition pattern — NO optional chaining in getModule filter
  this._Dispatcher =
    Webpack.Stores?.UserStore?._dispatcher ||
    Webpack.getModule(m => m.dispatch && m.subscribe) ||
    Webpack.getByKeys("actionLogger") ||
    null;

  if (this._Dispatcher) {
    this._subscribeFluxEvents();
    return;
  }

  // Poll for late-loading Dispatcher (same pattern as ShadowSenses)
  let attempt = 0;
  this._dispatcherPollTimer = setInterval(() => {
    attempt++;
    this._Dispatcher =
      BdApi.Webpack.Stores?.UserStore?._dispatcher ||
      BdApi.Webpack.getModule(m => m.dispatch && m.subscribe) ||
      null;

    if (this._Dispatcher) {
      clearInterval(this._dispatcherPollTimer);
      this._dispatcherPollTimer = null;
      this._subscribeFluxEvents();
      return;
    }
    if (attempt >= 30) {
      clearInterval(this._dispatcherPollTimer);
      this._dispatcherPollTimer = null;
      this._logWarning("FLUX", "Dispatcher not found after 15s polling", null, "flux-poll-timeout");
    }
  }, 500);
}
```

**Step 3: Add `_subscribeFluxEvents()` method**

```javascript
_subscribeFluxEvents() {
  if (!this._Dispatcher) return;

  const events = {
    PRESENCE_UPDATES: (event) => {
      if (!this.settings.enabled || !this.settings.invisibleStatus) return;
      // Re-force invisible whenever Discord updates presence
      this._ensureInvisibleStatus();
    },

    IDLE: () => {
      if (!this.settings.enabled || !this.settings.suppressIdle) return;
      this._recordSuppressed("idle");
      // Can't truly block Flux dispatch via subscribe, but we immediately counteract
      this._ensureInvisibleStatus();
    },

    AFK: () => {
      if (!this.settings.enabled || !this.settings.suppressIdle) return;
      this._recordSuppressed("idle");
      this._ensureInvisibleStatus();
    },

    TRACK: () => {
      if (!this.settings.enabled || !this.settings.suppressTelemetry) return;
      this._recordSuppressed("telemetry");
    },

    CONNECTION_OPEN: () => {
      // Re-apply Sentry cleanup after gateway reconnect
      if (this.settings.enabled && this.settings.suppressTelemetry) {
        this._disableSentryAndTelemetry();
      }
      // Re-force invisible after reconnect
      if (this.settings.enabled && this.settings.invisibleStatus) {
        setTimeout(() => this._ensureInvisibleStatus(), 1000);
      }
    },
  };

  for (const [eventName, handler] of Object.entries(events)) {
    try {
      this._Dispatcher.subscribe(eventName, handler);
      this._fluxHandlers.set(eventName, handler);
    } catch (err) {
      this._logWarning("FLUX", `Failed to subscribe to ${eventName}`, err, `flux-sub-${eventName}`);
    }
  }
}
```

**Step 4: Add `_unsubscribeFluxEvents()` method**

```javascript
_unsubscribeFluxEvents() {
  if (!this._Dispatcher) return;

  for (const [eventName, handler] of this._fluxHandlers.entries()) {
    try {
      this._Dispatcher.unsubscribe(eventName, handler);
    } catch (err) {
      this._logWarning("FLUX", `Failed to unsubscribe from ${eventName}`, err, `flux-unsub-${eventName}`);
    }
  }
  this._fluxHandlers.clear();
}
```

**Step 5: Wire into `start()` and `stop()`**

In `start()` (line 58-75), after `this._initStores();` add:

```javascript
this._initDispatcher();
```

In `stop()` (line 77-88), before `BdApi.Patcher.unpatchAll(...)` add:

```javascript
this._unsubscribeFluxEvents();
if (this._dispatcherPollTimer) {
  clearInterval(this._dispatcherPollTimer);
  this._dispatcherPollTimer = null;
}
```

**Step 6: Copy to BD, verify Flux subscriptions work**

```bash
cp betterdiscord-assets/plugins/Stealth.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
```

In DevTools console, verify no `[Stealth][FLUX]` warnings. Test: change status manually → should snap back to invisible immediately (not after 15s).

**Step 7: Commit**

```bash
git add plugins/Stealth.plugin.js
git commit -m "feat(stealth): add Flux Dispatcher backbone — reactive event subscriptions"
```

---

## Task 3: Reactive Status Enforcement

**Files:**
- Modify: `plugins/Stealth.plugin.js` — `_syncStatusPolicy()` (line 463-490)

**Step 1: Reduce fallback interval from 15s to 5s**

In `_syncStatusPolicy()` line 488, change:

```javascript
// Before:
}, 15000);

// After:
}, 5000);
```

This is now just a safety net — the primary enforcement is the `PRESENCE_UPDATES` Flux subscription from Task 2.

**Step 2: Copy and verify**

```bash
cp betterdiscord-assets/plugins/Stealth.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
```

Test: Status enforcement now has two layers — Flux reactive (instant) + 5s fallback poll.

**Step 3: Commit**

```bash
git add plugins/Stealth.plugin.js
git commit -m "fix(stealth): reduce status enforcement fallback from 15s to 5s"
```

---

## Task 4: Read Receipt Blocking

**Files:**
- Modify: `plugins/Stealth.plugin.js` — new `_patchReadReceipts()` method, wire into `_installPatches()`

**Step 1: Add `_patchReadReceipts()` method**

Add after `_patchAutoSilentMessages()` (after line 290):

```javascript
_patchReadReceipts() {
  let patched = 0;

  // Primary: patch ack/bulkAck module
  try {
    const ackModule =
      BdApi.Webpack.getByKeys("ack", "bulkAck") ||
      BdApi.Webpack.getByKeys("ack");

    if (ackModule) {
      if (typeof ackModule.ack === "function") {
        BdApi.Patcher.instead(
          STEALTH_PLUGIN_ID,
          ackModule,
          "ack",
          (ctx, args, original) => {
            if (this.settings.enabled && this.settings.suppressReadReceipts) {
              this._recordSuppressed("readReceipts");
              return undefined;
            }
            return original.apply(ctx, args);
          }
        );
        patched += 1;
      }

      if (typeof ackModule.bulkAck === "function") {
        BdApi.Patcher.instead(
          STEALTH_PLUGIN_ID,
          ackModule,
          "bulkAck",
          (ctx, args, original) => {
            if (this.settings.enabled && this.settings.suppressReadReceipts) {
              this._recordSuppressed("readReceipts");
              return undefined;
            }
            return original.apply(ctx, args);
          }
        );
        patched += 1;
      }
    }
  } catch (error) {
    this._logWarning("READ_RECEIPTS", "Failed to patch ack/bulkAck", error, "ack-patch");
  }

  // Fallback: scan for ack-like functions
  const fnNames = ["ack", "bulkAck", "localAck"];
  const keyCombos = [
    ["ack", "bulkAck"],
    ["ack"],
  ];

  patched += this._patchFunctions({
    fnNames,
    keyCombos,
    shouldBlock: () => this.settings.enabled && this.settings.suppressReadReceipts,
    onBlocked: () => this._recordSuppressed("readReceipts"),
    tag: "readReceipts",
    blockedReturnValue: undefined,
  });

  this._patchMetrics.readReceipts = patched;
}
```

**Step 2: Add `readReceipts` to `_patchMetrics`**

In constructor (line 41-47), add:

```javascript
this._patchMetrics = {
  typing: 0,
  activities: 0,
  telemetry: 0,
  silent: 0,
  process: 0,
  readReceipts: 0,
};
```

**Step 3: Wire into `_installPatches()`**

In `_installPatches()` (line 121-126), add:

```javascript
_installPatches() {
  this._patchTypingIndicators();
  this._patchActivityUpdates();
  this._patchTelemetry();
  this._patchAutoSilentMessages();
  this._patchReadReceipts();
}
```

**Step 4: Copy and verify**

```bash
cp betterdiscord-assets/plugins/Stealth.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
```

Test: Open a channel with unread messages. With stealth ON, the unread indicator should persist (messages aren't marked as read). Toggle `suppressReadReceipts` off → unreads should clear normally.

**Step 5: Commit**

```bash
git add plugins/Stealth.plugin.js
git commit -m "feat(stealth): add read receipt blocking — patch ack/bulkAck + Flux events"
```

---

## Task 5: Settings Panel Updates

**Files:**
- Modify: `plugins/Stealth.plugin.js` — `getSettingsPanel()` (line 723-899), `Metrics` component, `_setSetting()` handler

**Step 1: Add new settings panel rows**

In `getSettingsPanel()`, after the `disableProcessMonitor` row (line 879) and before the `autoSilentMessages` row, add:

```javascript
React.createElement(SettingRow, {
  settingKey: "suppressReadReceipts",
  title: "Block Read Receipts",
  description: "Prevents Discord from knowing which messages you have read.",
}),
React.createElement(SettingRow, {
  settingKey: "suppressIdle",
  title: "Suppress Idle Detection",
  description: "Blocks idle/AFK state transitions that can leak presence information.",
}),
```

**Step 2: Update Metrics display**

In the `Metrics` component (line 819-834), update the template string to include new counters:

```javascript
`Patched methods: typing ${self._patchMetrics.typing}, activities ${self._patchMetrics.activities}, telemetry ${self._patchMetrics.telemetry}, @silent ${self._patchMetrics.silent}, process ${self._patchMetrics.process}, read-receipts ${self._patchMetrics.readReceipts}`
```

**Step 3: Update `_setSetting()` for new settings**

In `_setSetting()` (line 673-700), the existing logic already handles the master `enabled` toggle and `invisibleStatus` specially. The new settings (`suppressReadReceipts`, `suppressIdle`) are guarded at the Flux/patch level, so they don't need special `_setSetting` handling — the default fall-through is fine.

**Step 4: Update plugin description header**

In the settings panel `Header` component (line 786), update the description text:

```javascript
"Total concealment: hide typing, force Invisible, block read receipts, suppress idle detection, silence messages, erase telemetry footprints, and sever process monitoring."
```

**Step 5: Copy and verify**

```bash
cp betterdiscord-assets/plugins/Stealth.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
```

Open Settings → Plugins → Stealth settings. Verify all 11 toggle rows render correctly with new rows visible. Toggle each new setting and verify it persists across reloads.

**Step 6: Commit**

```bash
git add plugins/Stealth.plugin.js
git commit -m "feat(stealth): update settings panel — read receipts, idle suppression, updated metrics"
```

---

## Task 6: Final Sync & Verification

**Files:**
- Copy: `plugins/Stealth.plugin.js` → `~/Library/Application Support/BetterDiscord/plugins/`

**Step 1: Full copy to BD plugins folder**

```bash
cp betterdiscord-assets/plugins/Stealth.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
```

**Step 2: Verification checklist**

In Discord with DevTools open (`Cmd+Shift+I`):

1. **Plugin loads**: Settings → Plugins → Stealth v2.0.0 shows, no console errors
2. **Typing suppression**: Type in a channel → no "User is typing..." visible to others (test with alt account or friend)
3. **Invisible status**: Status forced to invisible, check via alt account
4. **Status reactivity**: Manually change status to Online → should snap back to Invisible immediately (not 15s delay)
5. **Read receipts blocked**: Open channel with unread messages → unread badge persists, messages not marked as read
6. **Auto-silent messages**: Send a message → check it has `@silent` prefix (recipient gets no notification)
7. **Telemetry**: No `[Stealth][TELEMETRY]` errors in console
8. **Sentry**: After reconnect (toggle wifi off/on), Sentry cleanup should re-run (check `CONNECTION_OPEN` in console)
9. **Settings panel**: All 11 toggles render, persist across reload
10. **Clean stop**: Disable plugin → status restores to original, no console errors

**Step 3: Final commit with version bump**

```bash
git add plugins/Stealth.plugin.js
git commit -m "feat(stealth): Stealth v2.0.0 — total concealment with Flux Dispatcher backbone

Flux-based reactive status enforcement (instant, down from 15s polling).
Read receipt blocking (ack/bulkAck patches + Flux event suppression).
Anti-idle suppression (IDLE/AFK event handling).
Persistent Sentry cleanup (re-runs on CONNECTION_OPEN).
All stealth features default ON — total shadow concealment.
Bug fixes: wrong suppression category, missing stopTyping, error swallowing."
```

---

## Summary of All Changes

| Area | Before (v1.1.2) | After (v2.0.0) |
|------|-----------------|-----------------|
| Status enforcement | 15s polling | Flux reactive + 5s fallback |
| Read receipts | Not blocked | ack/bulkAck patched + Flux |
| Idle detection | Not suppressed | IDLE/AFK events handled |
| Sentry cleanup | One-shot | Re-runs on CONNECTION_OPEN |
| Auto-silent default | OFF | ON |
| Typing suppression | startTyping only | startTyping + stopTyping |
| Error logging | setPresence swallowed | Logged before fallback |
| Suppression tracking | Missing "silent" | All categories tracked |
| Flux Dispatcher | Not used | Core backbone |
