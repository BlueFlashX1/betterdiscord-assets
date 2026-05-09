# Stealth v2.0 — Total Concealment Design

> **Date**: 2026-02-24
> **Plugin**: Stealth.plugin.js (currently v1.1.2 → v2.0.0)
> **Goal**: Comprehensive stealth — Sung Jinwoo-level shadow concealment

---

## Problem Statement

Stealth v1.1.2 has 6 features (typing suppression, activity suppression, telemetry blocking, Sentry hardening, process monitor disabling, auto-silent messages, invisible status forcing) but relies on a 15-second polling interval for status enforcement, has no Flux Dispatcher interception, no read receipt blocking, and no anti-idle detection. Several bugs exist including wrong suppression categories and swallowed errors.

---

## Architecture: Flux Dispatcher Backbone

The core change: replace polling-based status enforcement with reactive Flux event interception.

### Dispatcher Acquisition

```javascript
const { Webpack } = BdApi;
this._Dispatcher =
  Webpack.Stores?.UserStore?._dispatcher ||
  Webpack.getModule(m => m.dispatch && m.subscribe) ||
  Webpack.getByKeys("actionLogger");
```

Uses the proven pattern from ShadowSenses (Feb 18, 2026 session). `Stores.UserStore._dispatcher` is most reliable.

### Subscribed Events

| Event | Action | Setting Guard |
|-------|--------|---------------|
| `PRESENCE_UPDATES` | Re-force invisible status immediately | `invisibleStatus` |
| `IDLE` / `AFK` | Suppress idle state transitions | `suppressIdle` |
| `TYPING_START` | Secondary typing suppression at Flux level | `suppressTyping` |
| `MESSAGE_ACK` / `BULK_ACK` / `TRY_ACK` | Block read receipt dispatch | `suppressReadReceipts` |
| `TRACK` | Enhanced telemetry blocking at Flux level | `suppressTelemetry` |
| `CONNECTION_OPEN` | Re-run Sentry cleanup after reconnects | `suppressTelemetry` |

### Status Enforcement

- Primary: Reactive via `PRESENCE_UPDATES` subscription (instant)
- Fallback: 5-second interval (down from 15s) as safety net

---

## New Features

### 1. Read Receipt Blocking

**HTTP layer**: Patch `ack` and `bulkAck` Webpack modules via `BdApi.Patcher.instead()`.

```javascript
const ackModule = BdApi.Webpack.getByKeys("ack", "bulkAck") ||
                  BdApi.Webpack.getByKeys("ack");
```

**Flux layer**: Subscribe to `MESSAGE_ACK`, `BULK_ACK`, `TRY_ACK` — suppress propagation.

**Trade-off**: Unread indicators accumulate since Discord doesn't know messages were read. Expected behavior for stealth.

**Setting**: `suppressReadReceipts` (default: `true`)

### 2. Anti-Idle Suppression

Subscribe to `IDLE` and `AFK` Flux events. Suppress dispatch so presence never shifts to idle.

Without this, Discord's internal idle state tracking can influence notification routing and presence leaks even while invisible.

**Setting**: `suppressIdle` (default: `true`)

---

## Bug Fixes

| Bug | Severity | Fix |
|-----|----------|-----|
| `_recordSuppressed("activities")` in `_patchAutoSilentMessages` | Low | Change to `"silent"` |
| 15s status enforcement interval | High | Flux reactive + 5s fallback |
| Sentry cleanup non-persistent | Medium | Re-run on `CONNECTION_OPEN` |
| `setPresence` error silently swallowed | Low | Log original error before fallback |
| Missing `stopTyping` suppression | Low | Add to patched function list |
| Missing `_suppressEventLog.silent` init | Low | Add to constructor |

---

## Updated Settings & Defaults

```javascript
const DEFAULT_SETTINGS = {
  enabled: true,
  suppressTyping: true,
  invisibleStatus: true,
  suppressActivities: true,
  suppressTelemetry: true,
  disableProcessMonitor: true,
  autoSilentMessages: true,       // CHANGED: was false → true for total stealth
  suppressReadReceipts: true,     // NEW
  suppressIdle: true,             // NEW
  restoreStatusOnStop: true,
  showToasts: true,
};
```

All stealth features ON by default. Total concealment.

### New Settings Panel Rows

Two new rows in existing purple gradient style:

- **Block Read Receipts** — `suppressReadReceipts` — "Prevents Discord from knowing which messages you have read."
- **Suppress Idle Detection** — `suppressIdle` — "Blocks idle/AFK state transitions that can leak presence."

---

## What's NOT Changing

- `_patchFunctions` generic utility — works correctly
- Settings panel architecture (React-based)
- Toast fallback chain (`PluginUtils → BdApi.UI → BdApi legacy`)
- `_logWarning` throttle system
- `_collectModules` / `_dedupeModules` pattern
- CSS injection approach

---

## Implementation Phases

### Phase 1: Bug Fixes
- Fix `_recordSuppressed` category
- Add `stopTyping` to suppression
- Add `_suppressEventLog.silent` init
- Fix `setPresence` error logging

### Phase 2: Flux Dispatcher Integration
- Acquire Dispatcher (proven pattern)
- Set up subscription management (subscribe on start, unsubscribe on stop)
- Wire `CONNECTION_OPEN` → re-run Sentry cleanup

### Phase 3: Reactive Status Enforcement
- Subscribe to `PRESENCE_UPDATES` for instant re-force
- Reduce fallback interval to 5s
- Subscribe to `IDLE`/`AFK` for anti-idle

### Phase 4: Read Receipt Blocking
- Patch `ack`/`bulkAck` at HTTP layer
- Subscribe to `MESSAGE_ACK`/`BULK_ACK`/`TRY_ACK` at Flux layer

### Phase 5: Settings & UI
- Add new defaults (`autoSilentMessages: true`, `suppressReadReceipts: true`, `suppressIdle: true`)
- Add settings panel rows for new features
- Bump version to 2.0.0

---

## Version

v1.1.2 → **v2.0.0** (major: new features, architectural change to Flux-based interception)
