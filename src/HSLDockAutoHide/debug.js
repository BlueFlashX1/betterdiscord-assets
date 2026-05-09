function describeDock(el) {
  if (!el) return null;
  const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  return {
    tag: String(el.tagName || "").toLowerCase(),
    id: el.id || null,
    className: typeof el.className === "string" ? el.className : null,
    ariaLabel: el.getAttribute?.("aria-label") || null,
    rect: rect ? { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
  };
}

function sanitizeDebugValue(engine, value) {
  if (value == null) return value;
  if (value instanceof Element) return describeDock(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeDebugValue(engine, entry));
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = sanitizeDebugValue(engine, item);
    return out;
  }
  if (typeof value === "function") return "[Function]";
  return value;
}

function sanitizeDebugData(engine, data) {
  const out = {};
  if (!data || typeof data !== "object") return out;
  for (const [key, value] of Object.entries(data)) out[key] = sanitizeDebugValue(engine, value);
  return out;
}

function snapshotState(engine) {
  return {
    lockRemainingMs: Math.max(0, engine.lockOpenUntil - Date.now()),
    hasMouseMoved: engine.hasMouseMoved,
    lastMouseX: engine.lastMouseX,
    lastMouseY: engine.lastMouseY,
    pointerOverDock: engine.pointerOverDock,
    nearBottom: typeof engine.isCursorInRevealStrip === "function"
      ? engine.isCursorInRevealStrip()
      : false,
    rootHiddenClass: Boolean(engine.stateTarget?.classList?.contains("sl-dock-hidden")),
    rootVisibleClass: Boolean(engine.stateTarget?.classList?.contains("sl-dock-visible")),
    dock: describeDock(engine.dock),
    dockTarget: describeDock(engine.dockMoveTarget),
    railVisible: engine.railVisible,
    railMounted: Boolean(engine.rail && engine.rail.parentElement),
    hideTimerActive: Boolean(engine.hideTimer),
    tickCount: engine.tickCount,
  };
}

function writeDebugEntry(engine, entry) {
  if (!engine.debugFileEnabled || !engine.fs || !engine.debugFilePath) return;
  try {
    engine.fs.appendFileSync(engine.debugFilePath, JSON.stringify(entry) + "\n");
  } catch (error) {
    engine.debugEnabled && console.warn("[HSLDockAutoHide] Failed writing debug entry to file", error);
  }
}

function installDebugApi(engine) {
  try {
    const handle = {
      version: engine.version,
      getLogs: () => engine.debugBuffer.slice(),
      dump: () => {
        const logs = engine.debugBuffer.slice();
        console.group("[HSLDockAutoHide] Debug dump");
        console.table(logs);
        console.groupEnd();
        return logs;
      },
      state: () => snapshotState(engine),
      filePath: () => engine.debugFilePath,
      clear: () => {
        engine.debugBuffer.length = 0;
        engine.debugSeq = 0;
        return true;
      },
    };
    try { window.__HSLDockAutoHideDebug = handle; } catch (error) { engine.debugEnabled && console.warn("[HSLDockAutoHide] Failed to install debug API on window", error); }
    try { globalThis.__HSLDockAutoHideDebug = handle; } catch (error) { engine.debugEnabled && console.warn("[HSLDockAutoHide] Failed to install debug API on globalThis", error); }
  } catch (error) {
    engine.debugEnabled && console.warn("[HSLDockAutoHide] Failed to install debug API", error);
  }
}

function removeDebugApi(engine) {
  try {
    delete window.__HSLDockAutoHideDebug;
  } catch (error) {
    engine.debugEnabled && console.warn("[HSLDockAutoHide] Failed to remove debug API from window", error);
  }
  try {
    delete globalThis.__HSLDockAutoHideDebug;
  } catch (error) {
    engine.debugEnabled && console.warn("[HSLDockAutoHide] Failed to remove debug API from globalThis", error);
  }
}

function initDebugFileSink(engine) {
  if (!engine.debugFileEnabled) return;
  try {
    const fs = require("fs");
    const path = require("path");
    const os = require("os");
    const dir = path.join(os.homedir(), "Library", "Application Support", "BetterDiscord", "logs", "HSLDockAutoHide");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    engine.debugFilePath = path.join(dir, `dock-autohide-${stamp}.jsonl`);
    engine.fs = fs;
  } catch (error) {
    engine.debugFilePath = null;
    engine.fs = null;
    engine.debugEnabled && console.warn("[HSLDockAutoHide] Failed to initialize debug file sink", error);
  }
}

function debug(engine, event, data = {}, includeState = false) {
  if (!engine.debugEnabled) return;
  const entry = { seq: ++engine.debugSeq, at: new Date().toISOString(), event, ...sanitizeDebugData(engine, data) };
  if (includeState) entry.state = snapshotState(engine);
  engine.debugBuffer.push(entry);
  if (engine.debugBuffer.length > engine.debugMaxEntries) engine.debugBuffer.shift();
  writeDebugEntry(engine, entry);
  if (engine.debugConsole) {
    try {
      console.debug("[HSLDockAutoHide]", entry);
    } catch (error) {
      engine.debugEnabled && console.warn("[HSLDockAutoHide] Failed to write debug console entry", error);
    }
  }
}

module.exports = {
  debug,
  describeDock,
  initDebugFileSink,
  installDebugApi,
  removeDebugApi,
  sanitizeDebugData,
  sanitizeDebugValue,
  snapshotState,
  writeDebugEntry,
};
