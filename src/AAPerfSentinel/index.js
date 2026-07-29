/**
 * AAPerfSentinel — suite-wide performance profiler.
 *
 * Answers "which plugin is making Discord lag, and how much is Discord/BD
 * itself?" by wrapping the registration points every plugin funnels through
 * (setTimeout / setInterval / requestAnimationFrame / MutationObserver /
 * FluxDispatcher.subscribe+dispatch), timing each callback, and attributing
 * the cost to the plugin whose .plugin.js file registered it (parsed from the
 * call stack at registration time — zero cost at callback time).
 *
 * Output: ONE text file, fully overwritten every flush (no growth, no spam):
 *   <BD plugins folder>/AAPerfSentinel-report.log
 *
 * Must load before the plugins it measures — BD loads addons alphabetically,
 * hence the AA prefix. Work registered before this plugin starts (or via
 * module-scope aliases of the timer functions captured pre-wrap) is invisible
 * to attribution and shows up only in the global long-task / lag numbers.
 */

const fs = require("fs");
const path = require("path");

const REPORT_BASENAME = "AAPerfSentinel-report.log";
const FLUSH_INTERVAL_MS = 30000;
const LAG_PROBE_INTERVAL_MS = 200;
const LAG_RING_SIZE = 300; // 60s of probe samples
const LONGTASK_RING_SIZE = 10;
const FRAME_DROP_THRESHOLD_MS = 33; // ~2 missed 60fps frames
const OWN_NAME = "AAPerfSentinel";

const PLUGIN_FILE_RE = /([\w-]+)\.plugin\.js/;

module.exports = class AAPerfSentinel {
  constructor() {
    this._debugMode = false;
    this._startedAt = 0;
    this._flushes = 0;
    this._dirty = false;

    // owner -> { timer: {calls,totalMs,maxMs}, raf: {...}, observer: {...}, flux: {...} }
    this._byPlugin = new Map();
    // action type -> {calls,totalMs,maxMs} for dispatcher.dispatch as a whole
    this._dispatchByAction = new Map();

    this._longTasks = { count: 0, totalMs: 0, maxMs: 0, recent: [] };
    this._prevSnap = null; // last flush's totals, for the window-delta section
    this._lagSamples = [];
    this._lagMax = 0;
    this._skipNextLagSample = false;
    this._frames = { total: 0, dropped: 0, worstMs: 0 };

    this._originals = null; // captured at start, restored at stop
    this._stopped = true;
    this._flushHandle = null;
    this._lagHandle = null;
    this._rafHandle = null;
    this._perfObserver = null;
    this._dispatcher = null;
    this._visibilityHandler = null;
  }

  // ── Attribution ────────────────────────────────────────────────────────

  _ownerFromStack() {
    // Parse the first plugin filename in the stack that isn't us. Plain
    // string scan (no split/regex-per-line) — this runs on every timer/rAF
    // registration, so it must stay cheap.
    const stack = new Error().stack || "";
    let searchFrom = 0;
    for (;;) {
      const m = PLUGIN_FILE_RE.exec(stack.slice(searchFrom));
      if (!m) return "discord/other";
      if (m[1] !== OWN_NAME) return m[1];
      searchFrom += m.index + m[0].length;
    }
  }

  _record(owner, kind, ms) {
    let entry = this._byPlugin.get(owner);
    if (!entry) {
      entry = {
        timer: { calls: 0, totalMs: 0, maxMs: 0 },
        raf: { calls: 0, totalMs: 0, maxMs: 0 },
        observer: { calls: 0, totalMs: 0, maxMs: 0 },
        flux: { calls: 0, totalMs: 0, maxMs: 0 },
      };
      this._byPlugin.set(owner, entry);
    }
    const bucket = entry[kind];
    bucket.calls++;
    bucket.totalMs += ms;
    if (ms > bucket.maxMs) bucket.maxMs = ms;
    if (ms >= 1) this._dirty = true;
  }

  _wrapCallback(owner, kind, fn) {
    const self = this;
    return function (...args) {
      if (self._stopped) return fn.apply(this, args);
      const t0 = performance.now();
      try {
        return fn.apply(this, args);
      } finally {
        self._record(owner, kind, performance.now() - t0);
      }
    };
  }

  // ── Instrumentation install / teardown ─────────────────────────────────

  _installTimerWraps() {
    const self = this;
    const o = this._originals;

    window.setTimeout = function (fn, delay, ...args) {
      if (typeof fn !== "function") return o.setTimeout.call(window, fn, delay, ...args);
      return o.setTimeout.call(window, self._wrapCallback(self._ownerFromStack(), "timer", fn), delay, ...args);
    };
    window.setInterval = function (fn, delay, ...args) {
      if (typeof fn !== "function") return o.setInterval.call(window, fn, delay, ...args);
      return o.setInterval.call(window, self._wrapCallback(self._ownerFromStack(), "timer", fn), delay, ...args);
    };
    window.requestAnimationFrame = function (fn) {
      if (typeof fn !== "function") return o.requestAnimationFrame.call(window, fn);
      return o.requestAnimationFrame.call(window, self._wrapCallback(self._ownerFromStack(), "raf", fn));
    };
  }

  _installObserverWrap() {
    const self = this;
    const OrigMO = this._originals.MutationObserver;

    window.MutationObserver = class extends OrigMO {
      constructor(callback) {
        super(typeof callback === "function"
          ? self._wrapCallback(self._ownerFromStack(), "observer", callback)
          : callback);
      }
    };
  }

  _installFluxWraps() {
    try {
      const { acquireDispatcher } = require("../shared/dispatcher");
      this._dispatcher = acquireDispatcher();
    } catch (_) {
      this._dispatcher = null;
    }
    const dispatcher = this._dispatcher;
    if (!dispatcher || typeof dispatcher.subscribe !== "function") return;

    const self = this;
    const origSubscribe = dispatcher.subscribe.bind(dispatcher);
    const origUnsubscribe =
      typeof dispatcher.unsubscribe === "function" ? dispatcher.unsubscribe.bind(dispatcher) : null;
    const origDispatch =
      typeof dispatcher.dispatch === "function" ? dispatcher.dispatch.bind(dispatcher) : null;

    this._originals.fluxSubscribe = origSubscribe;
    this._originals.fluxUnsubscribe = origUnsubscribe;
    this._originals.fluxDispatch = origDispatch;
    // original listener -> wrapped listener, so unsubscribe keeps working
    this._fluxWrapMap = new WeakMap();

    dispatcher.subscribe = (event, listener) => {
      if (typeof listener !== "function") return origSubscribe(event, listener);
      const wrapped = self._wrapCallback(self._ownerFromStack(), "flux", listener);
      self._fluxWrapMap.set(listener, wrapped);
      return origSubscribe(event, wrapped);
    };
    if (origUnsubscribe) {
      dispatcher.unsubscribe = (event, listener) => {
        const wrapped = listener && self._fluxWrapMap.get(listener);
        return origUnsubscribe(event, wrapped || listener);
      };
    }
    if (origDispatch) {
      dispatcher.dispatch = (payload) => {
        if (self._stopped) return origDispatch(payload);
        const t0 = performance.now();
        try {
          return origDispatch(payload);
        } finally {
          const ms = performance.now() - t0;
          const type = (payload && payload.type) || "UNKNOWN";
          let b = self._dispatchByAction.get(type);
          if (!b) {
            b = { calls: 0, totalMs: 0, maxMs: 0 };
            self._dispatchByAction.set(type, b);
          }
          b.calls++;
          b.totalMs += ms;
          if (ms > b.maxMs) b.maxMs = ms;
        }
      };
    }
  }

  _installLongTaskObserver() {
    try {
      this._perfObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this._longTasks.count++;
          this._longTasks.totalMs += entry.duration;
          if (entry.duration > this._longTasks.maxMs) this._longTasks.maxMs = entry.duration;
          this._longTasks.recent.push({ at: Date.now(), ms: Math.round(entry.duration) });
          if (this._longTasks.recent.length > LONGTASK_RING_SIZE) this._longTasks.recent.shift();
          this._dirty = true;
        }
      });
      this._perfObserver.observe({ type: "longtask", buffered: false });
    } catch (_) {
      this._perfObserver = null; // longtask entry type unavailable — report will say so
    }
  }

  _installLagProbe() {
    const o = this._originals;
    let expected = performance.now() + LAG_PROBE_INTERVAL_MS;
    this._lagHandle = o.setInterval.call(window, () => {
      const now = performance.now();
      const drift = now - expected;
      expected = now + LAG_PROBE_INTERVAL_MS;
      // Chrome throttles hidden-tab timers to ~1/s — that drift is throttling,
      // not main-thread lag. Skip while hidden and skip the catch-up sample.
      if (document.hidden) {
        this._skipNextLagSample = true;
        return;
      }
      if (this._skipNextLagSample) {
        this._skipNextLagSample = false;
        return;
      }
      const lag = Math.max(0, drift);
      this._lagSamples.push(lag);
      if (this._lagSamples.length > LAG_RING_SIZE) this._lagSamples.shift();
      if (lag > this._lagMax) this._lagMax = lag;
    }, LAG_PROBE_INTERVAL_MS);

    this._visibilityHandler = () => {
      this._skipNextLagSample = true;
      this._lastFrameTs = 0;
    };
    document.addEventListener("visibilitychange", this._visibilityHandler);
  }

  _installFrameMonitor() {
    const o = this._originals;
    this._lastFrameTs = 0;
    const tick = (ts) => {
      if (this._stopped) return;
      if (document.hidden) {
        // rAF pauses while hidden; without this reset the first visible
        // frame after un-hiding measures the whole hidden span as one
        // "gap" (observed: a fake 110s worst frame). Baseline restarts on
        // the next visible tick — visibilitychange also clears it.
        this._lastFrameTs = 0;
      } else {
        if (this._lastFrameTs) {
          const delta = ts - this._lastFrameTs;
          this._frames.total++;
          if (delta > FRAME_DROP_THRESHOLD_MS) {
            this._frames.dropped++;
            if (delta > this._frames.worstMs) this._frames.worstMs = delta;
          }
        }
        this._lastFrameTs = ts;
      }
      this._rafHandle = o.requestAnimationFrame.call(window, tick);
    };
    this._rafHandle = o.requestAnimationFrame.call(window, tick);
  }

  // ── Report ─────────────────────────────────────────────────────────────

  _reportPath() {
    // Conventions: write inside the BD plugins folder — Discord has no TCC
    // grant for ~/Documents, and BdApi.Plugins.folder is always writable.
    return path.join(BdApi.Plugins.folder, REPORT_BASENAME);
  }

  _percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
  }

  _fmtMs(ms) {
    return ms >= 100 ? String(Math.round(ms)) : (Math.round(ms * 10) / 10).toFixed(1);
  }

  _buildReport() {
    const now = new Date();
    const uptimeMs = Date.now() - this._startedAt;
    const uptimeMin = Math.floor(uptimeMs / 60000);
    const lines = [];

    lines.push("AAPerfSentinel — plugin performance report");
    lines.push(`Generated: ${now.toLocaleString()} (local) | uptime ${uptimeMin}m ${Math.floor((uptimeMs % 60000) / 1000)}s | flush #${this._flushes + 1}`);
    lines.push("This file is fully OVERWRITTEN each flush (every 30s while active) — totals are cumulative since plugin start.");
    lines.push("");

    // Main-thread health
    lines.push("── MAIN THREAD ──────────────────────────────────────────────");
    if (this._perfObserver) {
      const lt = this._longTasks;
      lines.push(`Long tasks (>50ms blocks): ${lt.count} | total ${this._fmtMs(lt.totalMs)}ms | worst ${this._fmtMs(lt.maxMs)}ms`);
      if (lt.recent.length > 0) {
        const recent = lt.recent
          .map((e) => `${new Date(e.at).toLocaleTimeString()} ${e.ms}ms`)
          .join(", ");
        lines.push(`  last ${lt.recent.length}: ${recent}`);
      }
    } else {
      lines.push("Long tasks: PerformanceObserver('longtask') unavailable in this renderer.");
    }
    const sorted = [...this._lagSamples].sort((a, b) => a - b);
    lines.push(
      `Event-loop lag (${LAG_PROBE_INTERVAL_MS}ms probe, last ${sorted.length} visible samples): ` +
        `p50 ${this._fmtMs(this._percentile(sorted, 50))}ms | p95 ${this._fmtMs(this._percentile(sorted, 95))}ms | session max ${this._fmtMs(this._lagMax)}ms`
    );
    if (this._frames.total > 0) {
      const pct = ((1 - this._frames.dropped / this._frames.total) * 100).toFixed(1);
      lines.push(`Frames: ${pct}% under ${FRAME_DROP_THRESHOLD_MS}ms (${this._frames.dropped}/${this._frames.total} janky, worst gap ${this._fmtMs(this._frames.worstMs)}ms)`);
    }
    const mem = performance.memory;
    if (mem) {
      lines.push(`JS heap: ${Math.round(mem.usedJSHeapSize / 1048576)}MB used / ${Math.round(mem.jsHeapSizeLimit / 1048576)}MB limit`);
    }
    lines.push("");

    // Per-plugin attribution
    lines.push("── PER-PLUGIN ATTRIBUTION (work registered after this plugin started) ──");
    lines.push("plugin                    kind      calls     total ms    max ms   ~share of uptime");
    const rows = [];
    for (const [owner, kinds] of this._byPlugin) {
      for (const kind of ["timer", "raf", "observer", "flux"]) {
        const b = kinds[kind];
        if (b.calls === 0) continue;
        rows.push({ owner, kind, ...b });
      }
    }
    rows.sort((a, b) => b.totalMs - a.totalMs);
    if (rows.length === 0) {
      lines.push("(nothing attributed yet — plugins may all have started before this one; see LIMITATIONS)");
    }
    for (const r of rows) {
      const share = ((r.totalMs / uptimeMs) * 100).toFixed(2);
      lines.push(
        `${r.owner.padEnd(25)} ${r.kind.padEnd(9)} ${String(r.calls).padStart(8)} ${this._fmtMs(r.totalMs).padStart(11)} ${this._fmtMs(r.maxMs).padStart(9)}   ${share}%`
      );
    }
    lines.push("");

    // Totals per plugin (the headline table)
    const totals = [];
    for (const [owner, kinds] of this._byPlugin) {
      const totalMs =
        kinds.timer.totalMs + kinds.raf.totalMs + kinds.observer.totalMs + kinds.flux.totalMs;
      const maxMs = Math.max(kinds.timer.maxMs, kinds.raf.maxMs, kinds.observer.maxMs, kinds.flux.maxMs);
      if (totalMs > 0) totals.push({ owner, totalMs, maxMs });
    }
    totals.sort((a, b) => b.totalMs - a.totalMs);
    lines.push("── HEADLINE: total attributed main-thread ms per plugin ──");
    for (const t of totals) {
      lines.push(`${t.owner.padEnd(25)} ${this._fmtMs(t.totalMs).padStart(11)}ms   (worst single callback ${this._fmtMs(t.maxMs)}ms)`);
    }
    if (this._perfObserver && this._longTasks.totalMs > 0) {
      const attributed = totals.reduce((s, t) => s + t.totalMs, 0);
      const unattributed = Math.max(0, this._longTasks.totalMs - attributed);
      lines.push("");
      lines.push(`Long-task time NOT attributed to any plugin: ~${this._fmtMs(unattributed)}ms`);
      lines.push("  (Discord/BD internals, React renders, or work registered before this plugin loaded.)");
    }
    lines.push("");

    // Flux dispatch cost by action type
    const actions = [...this._dispatchByAction.entries()]
      .sort((a, b) => b[1].totalMs - a[1].totalMs)
      .slice(0, 12);
    if (actions.length > 0) {
      lines.push("── FLUX DISPATCH — top action types by total ms (Discord stores + ALL subscribers) ──");
      for (const [type, b] of actions) {
        lines.push(`${type.padEnd(38)} ${String(b.calls).padStart(8)} calls ${this._fmtMs(b.totalMs).padStart(10)}ms  max ${this._fmtMs(b.maxMs)}ms`);
      }
      lines.push("");
    }

    // Window deltas — what moved since the previous flush. This is the
    // steady-state view: startup costs live only in the cumulative tables.
    const nowMs = Date.now();
    const snap = { at: nowMs, longMs: this._longTasks.totalMs, longCount: this._longTasks.count, perPlugin: new Map() };
    for (const t of totals) snap.perPlugin.set(t.owner, t.totalMs);
    if (this._prevSnap) {
      const windowSec = Math.max(1, Math.round((nowMs - this._prevSnap.at) / 1000));
      const movers = [];
      for (const [owner, totalMs] of snap.perPlugin) {
        const delta = totalMs - (this._prevSnap.perPlugin.get(owner) || 0);
        if (delta >= 1) movers.push({ owner, delta });
      }
      movers.sort((a, b) => b.delta - a.delta);
      lines.push(`── LAST WINDOW (~${windowSec}s) — attributed ms since previous flush ──`);
      const dLong = this._longTasks.totalMs - this._prevSnap.longMs;
      const dLongN = this._longTasks.count - this._prevSnap.longCount;
      lines.push(`Long tasks this window: ${dLongN} (${this._fmtMs(dLong)}ms)`);
      if (movers.length === 0) {
        lines.push("(no plugin accrued ≥1ms this window)");
      }
      for (const m of movers.slice(0, 8)) {
        const perMin = (m.delta / (windowSec / 60)).toFixed(0);
        lines.push(`${m.owner.padEnd(25)} +${this._fmtMs(m.delta)}ms  (~${perMin}ms/min)`);
      }
      lines.push("");
    }
    this._prevSnap = snap;

    lines.push("── LIMITATIONS ──");
    lines.push("- Attribution only sees timers/rAF/observers/flux listeners registered AFTER this");
    lines.push("  plugin started. It loads first alphabetically, so a full Discord restart (Cmd+Q)");
    lines.push("  gives complete coverage; mid-session enable only covers re-registrations.");
    lines.push("- Module-scope aliases of timer functions captured pre-wrap bypass attribution.");
    lines.push("- 'discord/other' rows = work whose registration stack showed no .plugin.js frame.");

    return lines.join("\n") + "\n";
  }

  _flush(force = false) {
    if (!force && !this._dirty) return;
    this._dirty = false;
    const report = this._buildReport();
    fs.writeFile(this._reportPath(), report, (err) => {
      if (err) {
        if (this._debugMode) console.error(`[${OWN_NAME}] report write failed:`, err);
        return;
      }
      this._flushes++;
    });
  }

  // ── BD lifecycle ───────────────────────────────────────────────────────

  start() {
    this._stopped = false;
    this._startedAt = Date.now();
    this._flushes = 0;
    this._debugMode = BdApi.Data.load(OWN_NAME, "debugMode") ?? false;

    this._originals = {
      setTimeout: window.setTimeout,
      setInterval: window.setInterval,
      requestAnimationFrame: window.requestAnimationFrame,
      MutationObserver: window.MutationObserver,
    };

    this._installTimerWraps();
    this._installObserverWrap();
    this._installFluxWraps();
    this._installLongTaskObserver();
    this._installLagProbe();
    this._installFrameMonitor();

    // Flush loop uses the ORIGINAL setInterval so the profiler never measures
    // (or attributes) its own heartbeat.
    this._flushHandle = this._originals.setInterval.call(window, () => this._flush(), FLUSH_INTERVAL_MS);
    // Early first write so the file exists ~10s after start.
    this._originals.setTimeout.call(window, () => this._flush(true), 10000);

    console.log(`[${OWN_NAME}] started — report: ${this._reportPath()} (overwritten every ${FLUSH_INTERVAL_MS / 1000}s)`);
  }

  stop() {
    this._stopped = true;
    const o = this._originals;
    if (!o) return;

    // Restore globals. Wrapped callbacks still registered elsewhere check
    // _stopped and pass straight through with zero measurement.
    if (o.setTimeout) window.setTimeout = o.setTimeout;
    if (o.setInterval) window.setInterval = o.setInterval;
    if (o.requestAnimationFrame) window.requestAnimationFrame = o.requestAnimationFrame;
    if (o.MutationObserver) window.MutationObserver = o.MutationObserver;

    const d = this._dispatcher;
    if (d) {
      if (o.fluxSubscribe) d.subscribe = o.fluxSubscribe;
      if (o.fluxUnsubscribe) d.unsubscribe = o.fluxUnsubscribe;
      if (o.fluxDispatch) d.dispatch = o.fluxDispatch;
    }

    if (this._perfObserver) {
      try { this._perfObserver.disconnect(); } catch (_) {}
      this._perfObserver = null;
    }
    if (this._lagHandle) {
      clearInterval(this._lagHandle);
      this._lagHandle = null;
    }
    if (this._rafHandle) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }
    if (this._flushHandle) {
      clearInterval(this._flushHandle);
      this._flushHandle = null;
    }
    if (this._visibilityHandler) {
      document.removeEventListener("visibilitychange", this._visibilityHandler);
      this._visibilityHandler = null;
    }

    this._flush(true); // final snapshot with whatever accumulated
    console.log(`[${OWN_NAME}] stopped — final report flushed`);
  }

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.cssText =
      "padding:16px;background:rgba(10,10,16,0.98);border-radius:2px;color:#dcddde;font-size:13px;";

    const uptimeMin = this._startedAt ? Math.floor((Date.now() - this._startedAt) / 60000) : 0;

    const title = document.createElement("h3");
    title.style.cssText = "color:#8a2be2;margin:0 0 12px;";
    title.textContent = "AAPerfSentinel Statistics";
    panel.appendChild(title);

    const statsLine = document.createElement("div");
    statsLine.textContent =
      `Uptime: ${uptimeMin}m | Flushes: ${this._flushes} | Long tasks: ${this._longTasks.count} | Attributed sources: ${this._byPlugin.size}`;
    panel.appendChild(statsLine);

    const fileLine = document.createElement("div");
    fileLine.style.cssText = "margin-top:8px;opacity:.8;";
    fileLine.textContent = `Report file (overwritten every ${FLUSH_INTERVAL_MS / 1000}s):`;
    const code = document.createElement("code");
    code.style.cssText = "display:block;margin-top:4px;";
    code.textContent = this._reportPath();
    fileLine.appendChild(code);
    panel.appendChild(fileLine);

    const note = document.createElement("div");
    note.style.cssText = "margin-top:8px;opacity:.6;";
    note.textContent =
      "Full attribution requires a full Discord restart (Cmd+Q) so this plugin instruments before the others start.";
    panel.appendChild(note);

    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:14px;cursor:pointer;";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this._debugMode;
    checkbox.addEventListener("change", () => {
      this._debugMode = checkbox.checked;
      BdApi.Data.save(OWN_NAME, "debugMode", this._debugMode);
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode("Debug Mode (extra console diagnostics)"));
    panel.appendChild(label);

    return panel;
  }
};
