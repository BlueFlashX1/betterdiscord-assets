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
const LONGTASK_RING_SIZE = 20;
const FRAME_DROP_THRESHOLD_MS = 33; // ~2 missed 60fps frames
const OWN_NAME = "AAPerfSentinel";

const PLUGIN_FILE_RE = /([\w-]+)\.plugin\.js/;
const KINDS = ["timer", "raf", "observer", "flux", "idb", "dom"];
const SITE_MAP_CAP = 1000;
const TOP_SITES_SHOWN = 40;
const TOP_TXN_SHOWN = 15;
const TOP_FLUX_SHOWN = 20;
const TOP_WINDOW_SITES = 10;

module.exports = class AAPerfSentinel {
  constructor() {
    this._debugMode = false;
    this._startedAt = 0;
    this._flushes = 0;
    this._dirty = false;

    // owner -> { <kind>: {calls,totalMs,maxMs,longCalls} } for each of KINDS
    this._byPlugin = new Map();
    // "owner\0kind\0fnName" -> {owner,kind,site,calls,totalMs,maxMs} (capped)
    this._bySite = new Map();
    // "owner site" -> count of IDB transactions CREATED (walk-frequency signal)
    this._txnStats = new Map();
    // owner -> {adds, removes} for wrapped DOM listeners (leak gauge)
    this._domGauge = new Map();
    this._prevSiteSnap = null; // site totals at previous flush, for window movers
    this._loaf = null; // Long Animation Frames: browser-attributed script + style/layout
    this._slowEvents = new Map(); // Event Timing: slow interaction handlers
    this._storage = new Map(); // owner -> {writes, bytes, totalMs, maxMs} for localStorage
    this._timerGauge = new Map(); // owner -> {created, cleared} (leak gauge)
    this._netGauge = new Map(); // owner -> {calls, totalMs} for fetch/XHR
    this._cssGauge = new Map(); // owner -> {added, removed} for BdApi.DOM styles
    this._listenerSites = new Map(); // "owner site on:type" -> add count
    this._trend = []; // per-flush {t, heapMB, domNodes, listeners} for slope detection
    this._cssAudit = null; // expensive-selector scan of injected CSS
    this._loafProbe = { pluginRows: 0, unresolved: 0, sampleUrls: new Set() };
    this._burstsWritten = 0; // capped per session
    this._txnOwners = null; // WeakMap IDBTransaction -> owner (set at creation)
    this._domWrapMap = null; // WeakMap listener -> wrapped (or identity)
    this._lastCpu = null; // last process.getCPUUsage() percent, per flush
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

  // Like _ownerFromStack, but also extracts registering FUNCTION NAMES.
  // Takes the first TWO frames from the owning plugin (caller>callee, e.g.
  // "getAllShadowsRaw>_withStore") so generic wrappers don't mask who drove
  // them. Names survive esbuild's unminified bundling. Only runs at
  // registration/transaction time, never per callback.
  _ownerSiteFromStack() {
    const lines = (new Error().stack || "").split("\n");
    let owner = null;
    const names = [];
    for (const line of lines) {
      const m = PLUGIN_FILE_RE.exec(line);
      if (!m || m[1] === OWN_NAME) continue;
      if (owner === null) owner = m[1];
      else if (m[1] !== owner) break;
      if (names.length < 2) {
        const fm = /\bat\s+(?:new\s+)?(?:async\s+)?([\w$.<>[\]]+)\s*\(/.exec(line);
        if (fm && fm[1] !== "Object.<anonymous>") names.push(fm[1]);
      }
      if (names.length >= 2) break;
    }
    if (!owner) return { owner: "discord/other", site: "" };
    return { owner, site: names.reverse().join(">") };
  }

  _record(owner, kind, ms, site) {
    let entry = this._byPlugin.get(owner);
    if (!entry) {
      entry = {};
      for (const k of KINDS) entry[k] = { calls: 0, totalMs: 0, maxMs: 0, longCalls: 0 };
      this._byPlugin.set(owner, entry);
    }
    const bucket = entry[kind];
    bucket.calls++;
    bucket.totalMs += ms;
    if (ms > bucket.maxMs) bucket.maxMs = ms;
    if (ms > 50) bucket.longCalls++; // this callback WAS a long task
    if (ms >= 1) this._dirty = true;

    // Per-site breakdown ("what happens at runtime"): owner × kind × fn name.
    if (site) {
      const key = `${owner}|${kind}|${site}`;
      let s = this._bySite.get(key);
      if (!s) {
        if (this._bySite.size >= SITE_MAP_CAP) return; // bound memory; existing keys keep updating
        s = { owner, kind, site, calls: 0, totalMs: 0, maxMs: 0 };
        this._bySite.set(key, s);
      }
      s.calls++;
      s.totalMs += ms;
      if (ms > s.maxMs) s.maxMs = ms;
    }
  }

  _wrapCallback(owner, kind, fn, site = "") {
    const self = this;
    return function (...args) {
      if (self._stopped) return fn.apply(this, args);
      const t0 = performance.now();
      try {
        return fn.apply(this, args);
      } finally {
        self._record(owner, kind, performance.now() - t0, site);
      }
    };
  }

  // ── Instrumentation install / teardown ─────────────────────────────────

  _installTimerWraps() {
    const self = this;
    const o = this._originals;

    const countCreated = (owner) => {
      if (owner === "discord/other") return;
      const g = self._timerGauge.get(owner) || { created: 0, cleared: 0 };
      g.created++;
      self._timerGauge.set(owner, g);
    };
    window.setTimeout = function (fn, delay, ...args) {
      if (typeof fn !== "function") return o.setTimeout.call(window, fn, delay, ...args);
      const { owner, site } = self._ownerSiteFromStack();
      countCreated(owner);
      return o.setTimeout.call(window, self._wrapCallback(owner, "timer", fn, site), delay, ...args);
    };
    window.setInterval = function (fn, delay, ...args) {
      if (typeof fn !== "function") return o.setInterval.call(window, fn, delay, ...args);
      const { owner, site } = self._ownerSiteFromStack();
      countCreated(owner);
      return o.setInterval.call(window, self._wrapCallback(owner, "timer", fn, site), delay, ...args);
    };
    window.requestAnimationFrame = function (fn) {
      if (typeof fn !== "function") return o.requestAnimationFrame.call(window, fn);
      const { owner, site } = self._ownerSiteFromStack();
      return o.requestAnimationFrame.call(window, self._wrapCallback(owner, "raf", fn, site));
    };
  }

  _installObserverWrap() {
    const self = this;
    const OrigMO = this._originals.MutationObserver;

    window.MutationObserver = class extends OrigMO {
      constructor(callback) {
        if (typeof callback === "function") {
          const { owner, site } = self._ownerSiteFromStack();
          super(self._wrapCallback(owner, "observer", callback, site));
        } else {
          super(callback);
        }
      }
    };
  }

  _installIdbWraps() {
    const self = this;
    const o = this._originals;
    this._txnOwners = new WeakMap();

    // Attribute at TRANSACTION creation (a handful/second) instead of per
    // request (280k+ during army passes) — request handlers then look the
    // owner up via request.transaction with zero stack captures on the hot
    // path. This is the funnel that would have caught the 2026-07 compression
    // outage (IDB callbacks were invisible to v1).
    o.idbTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const txn = o.idbTransaction.apply(this, args);
      if (!self._stopped) {
        // Capture the CREATING FUNCTION too (cheap here: one stack per
        // transaction, not per request) — the sites table then names which
        // function drives IDB volume, e.g. "ShadowArmy idb getAllShadowsRaw".
        try {
          const info = self._ownerSiteFromStack();
          self._txnOwners.set(txn, info);
          if (info.owner !== "discord/other") {
            const key = `${info.owner} ${info.site || "(anonymous)"}`;
            self._txnStats.set(key, (self._txnStats.get(key) || 0) + 1);
          }
        } catch (_) {}
      }
      return txn;
    };

    const wrapHandlerDescriptor = (proto, prop, kindLabel) => {
      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || !desc.set) return null;
      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get() { return desc.get ? desc.get.call(this) : undefined; },
        set(fn) {
          if (typeof fn !== "function" || self._stopped) return desc.set.call(this, fn);
          const holder = this;
          desc.set.call(this, function (...a) {
            if (self._stopped) return fn.apply(this, a);
            const t0 = performance.now();
            try {
              return fn.apply(this, a);
            } finally {
              const txn = holder.transaction || holder;
              const info = self._txnOwners.get(txn);
              self._record(
                info ? info.owner : "discord/other",
                "idb",
                performance.now() - t0,
                info && info.site ? `${info.site} ${kindLabel}` : kindLabel
              );
            }
          });
        },
      });
      return desc;
    };

    o.idbReqSuccess = wrapHandlerDescriptor(IDBRequest.prototype, "onsuccess", "request.onsuccess");
    o.idbReqError = wrapHandlerDescriptor(IDBRequest.prototype, "onerror", "request.onerror");
    o.idbTxnComplete = wrapHandlerDescriptor(IDBTransaction.prototype, "oncomplete", "txn.oncomplete");
    o.idbTxnAbort = wrapHandlerDescriptor(IDBTransaction.prototype, "onabort", "txn.onabort");
  }

  _installDomWrap() {
    const self = this;
    const o = this._originals;
    this._domWrapMap = new WeakMap();

    o.addEventListener = EventTarget.prototype.addEventListener;
    o.removeEventListener = EventTarget.prototype.removeEventListener;

    EventTarget.prototype.addEventListener = function (type, listener, opts) {
      if (typeof listener !== "function" || self._stopped) {
        return o.addEventListener.call(this, type, listener, opts);
      }
      let wrapped = self._domWrapMap.get(listener);
      if (!wrapped) {
        const { owner, site } = self._ownerSiteFromStack();
        // Discord's own listeners stay UNWRAPPED (identity mapping): zero
        // runtime overhead for the host app; only plugin listeners are timed.
        if (owner === "discord/other") {
          wrapped = listener;
        } else {
          wrapped = self._wrapCallback(owner, "dom", listener, site ? `${site} on:${type}` : `on:${type}`);
          wrapped._psOwner = owner;
          wrapped._psSite = site || "?";
        }
        self._domWrapMap.set(listener, wrapped);
      }
      if (wrapped._psOwner) {
        const g = self._domGauge.get(wrapped._psOwner) || { adds: 0, removes: 0 };
        g.adds++;
        self._domGauge.set(wrapped._psOwner, g);
        // Count EVERY add (not just first sight of a given function) — repeat
        // adds are exactly the churn signal we're hunting.
        const akey = `${wrapped._psOwner} ${wrapped._psSite || "?"} on:${type}`;
        if (self._listenerSites.has(akey)) {
          self._listenerSites.set(akey, self._listenerSites.get(akey) + 1);
        } else if (self._listenerSites.size < 300) {
          self._listenerSites.set(akey, 1);
        }
      }
      return o.addEventListener.call(this, type, wrapped, opts);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, opts) {
      const wrapped = (listener && self._domWrapMap.get(listener)) || listener;
      if (wrapped && wrapped._psOwner) {
        const g = self._domGauge.get(wrapped._psOwner);
        if (g) g.removes++;
      }
      return o.removeEventListener.call(this, type, wrapped, opts);
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
      const { owner, site } = self._ownerSiteFromStack();
      const wrapped = self._wrapCallback(owner, "flux", listener, site || `flux:${event}`);
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

  // Long Animation Frames (Chromium 123+). The browser's OWN attribution:
  // per-frame script entries carry sourceURL + sourceFunctionName, plus
  // renderStart / styleAndLayoutDuration / blockingDuration. This catches
  // what JS wrapping structurally CANNOT — forced reflow cost, style
  // recalculation, and script scheduled through paths we never wrapped
  // (microtasks, await continuations, native callbacks). Feature-detected:
  // if the entry type is unsupported the report says so explicitly.
  _installLoafObserver() {
    this._loaf = { supported: false, frames: 0, totalBlockingMs: 0, worstMs: 0, byScript: new Map(), styleLayoutMs: 0 };
    try {
      const supported = PerformanceObserver.supportedEntryTypes || [];
      if (!supported.includes("long-animation-frame")) return;
      this._loafObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this._loaf.frames++;
          this._loaf.totalBlockingMs += entry.blockingDuration || 0;
          this._loaf.styleLayoutMs += entry.styleAndLayoutDuration || 0;
          if (entry.duration > this._loaf.worstMs) this._loaf.worstMs = entry.duration;
          for (const s of entry.scripts || []) {
            const src = String(s.sourceURL || "");
            const m = PLUGIN_FILE_RE.exec(src);
            // ATTRIBUTION PROBE: no plugin row has EVER appeared here. Either
            // the suite genuinely causes no long frames, or LoAF can't resolve
            // BD-injected script URLs. Record which sourceURL shapes arrive so
            // the report can state which case we're in instead of implying the
            // flattering one.
            if (m) this._loafProbe.pluginRows++;
            else {
              this._loafProbe.unresolved++;
              if (this._loafProbe.sampleUrls.size < 6) {
                this._loafProbe.sampleUrls.add(src ? src.slice(0, 90) : "(empty sourceURL)");
              }
            }
            const owner = m ? m[1] : (src.includes("discord") ? "discord/other" : "unknown");
            const fn = s.sourceFunctionName || s.invoker || "(anonymous)";
            const key = `${owner} ${String(fn).slice(0, 40)}`;
            let b = this._loaf.byScript.get(key);
            if (!b) {
              if (this._loaf.byScript.size >= SITE_MAP_CAP) continue;
              b = { owner, fn, calls: 0, totalMs: 0, maxMs: 0, forcedStyleMs: 0 };
              this._loaf.byScript.set(key, b);
            }
            b.calls++;
            b.totalMs += s.duration || 0;
            b.forcedStyleMs += s.forcedStyleAndLayoutDuration || 0;
            if ((s.duration || 0) > b.maxMs) b.maxMs = s.duration || 0;
          }
          this._dirty = true;
        }
      });
      this._loafObserver.observe({ type: "long-animation-frame", buffered: false });
      this._loaf.supported = true;
    } catch (_) {
      this._loaf.supported = false;
    }
  }

  // Event Timing: interaction handlers slower than the threshold, with the
  // target element. Catches the click/keydown freezes (ShadowStep panel,
  // toast clicks) that only manifest on user interaction.
  _installEventTimingObserver() {
    this._eventTimingSupported = false;
    try {
      const supported = PerformanceObserver.supportedEntryTypes || [];
      if (!supported.includes("event")) return;
      this._eventObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const dur = entry.duration || 0;
          if (dur < 50) continue;
          const target = entry.target;
          const label = target
            ? `${target.tagName || "?"}${target.id ? "#" + target.id : ""}${target.className && typeof target.className === "string" ? "." + target.className.split(" ")[0] : ""}`
            : "(no target)";
          const key = `${entry.name} ${label}`.slice(0, 70);
          let b = this._slowEvents.get(key);
          if (!b) {
            if (this._slowEvents.size >= 200) continue;
            b = { count: 0, totalMs: 0, maxMs: 0 };
            this._slowEvents.set(key, b);
          }
          b.count++;
          b.totalMs += dur;
          if (dur > b.maxMs) b.maxMs = dur;
          this._dirty = true;
        }
      });
      this._eventObserver.observe({ type: "event", durationThreshold: 50, buffered: false });
      this._eventTimingSupported = true;
    } catch (_) {
      this._eventTimingSupported = false;
    }
  }

  // BdApi.Data.save is a SYNCHRONOUS WHOLE-FILE REWRITE — verified in BD
  // source (stores/json.ts): setData() → #savePluginData() →
  // fs.writeFileSync(file, JSON.stringify(cache, null, 4)). No batching, no
  // debounce, and it serializes the plugin's ENTIRE config every call
  // (SoloLevelingStats.config.json is 128KB on this machine). Reads are
  // memory-cached, so only WRITES matter. This is the single most valuable
  // storage instrument in the suite — localStorage wrapping below misses it
  // entirely because BD writes through the Electron preload, not localStorage.
  _installBdDataWrap() {
    const self = this;
    const o = this._originals;
    try {
      const data = BdApi.Data;
      if (!data || typeof data.save !== "function") return;
      o.bdDataSave = data.save.bind(data);
      o.bdData = data;
      const wrapped = (pluginName, key, value) => {
        if (self._stopped) return o.bdDataSave(pluginName, key, value);
        const owner = self._ownerFromStack();
        const t0 = performance.now();
        try {
          return o.bdDataSave(pluginName, key, value);
        } finally {
          const ms = performance.now() - t0;
          const label = owner === "discord/other" ? String(pluginName) : owner;
          let b = self._storage.get(label);
          if (!b) {
            b = { writes: 0, bytes: 0, totalMs: 0, maxMs: 0, keys: new Set() };
            self._storage.set(label, b);
          }
          b.writes++;
          b.totalMs += ms;
          if (ms > b.maxMs) b.maxMs = ms;
          if (b.keys.size < 25) b.keys.add(String(key));
          if (ms >= 1) self._dirty = true;
        }
      };
      // VERIFY the wrap actually took. BdApi methods can be non-writable /
      // accessor-defined, in which case plain assignment fails SILENTLY in
      // sloppy mode and the report would show an empty section that looks
      // like "no writes happened" — a false all-clear. Retry via
      // defineProperty, then record the outcome for the report.
      data.save = wrapped;
      if (data.save !== wrapped) {
        try {
          Object.defineProperty(data, "save", { value: wrapped, writable: true, configurable: true });
        } catch (_) { /* fall through to the honest failure flag */ }
      }
      this._bdDataWrapOk = data.save === wrapped;
    } catch (_) {
      o.bdDataSave = null;
      this._bdDataWrapOk = false;
    }
  }

  // BdApi.Data.save turned out to be NON-WRITABLE (verified at runtime: the
  // v3.1 wrap failed and the report said so). Fall back one level down —
  // BD's json store writes through fs.writeFileSync, and plugins get the
  // same preload fs bridge via require("fs"). Attribution is by config
  // filename (the path names the plugin), which is exactly what we want.
  _installFsWrap() {
    const self = this;
    const o = this._originals;
    try {
      if (!fs || typeof fs.writeFileSync !== "function") return;
      o.writeFileSync = fs.writeFileSync;
      fs.writeFileSync = function (file, data, ...rest) {
        if (self._stopped) return o.writeFileSync.call(fs, file, data, ...rest);
        const t0 = performance.now();
        try {
          return o.writeFileSync.call(fs, file, data, ...rest);
        } finally {
          const ms = performance.now() - t0;
          const name = String(file || "");
          const m = /([\w-]+)\.config\.json$/.exec(name);
          const label = m ? m[1] : (name.split("/").pop() || "unknown");
          let b = self._storage.get(label);
          if (!b) {
            b = { writes: 0, bytes: 0, totalMs: 0, maxMs: 0, keys: new Set() };
            self._storage.set(label, b);
          }
          b.writes++;
          b.bytes += typeof data === "string" ? data.length : (data?.byteLength || 0);
          b.totalMs += ms;
          if (ms > b.maxMs) b.maxMs = ms;
          if (ms >= 1) self._dirty = true;
        }
      };
      this._fsWrapOk = fs.writeFileSync !== o.writeFileSync;
    } catch (_) {
      this._fsWrapOk = false;
    }
  }

  // localStorage wrap kept as a secondary net (Discord's own writes, any
  // plugin using it directly) — NOT the BdApi.Data path, see above.
  _installStorageWrap() {
    const self = this;
    const o = this._originals;
    try {
      const proto = Object.getPrototypeOf(window.localStorage) || Storage.prototype;
      o.setItem = proto.setItem;
      proto.setItem = function (key, value) {
        if (self._stopped) return o.setItem.call(this, key, value);
        const owner = self._ownerFromStack();
        const t0 = performance.now();
        try {
          return o.setItem.call(this, key, value);
        } finally {
          const ms = performance.now() - t0;
          let b = self._storage.get(owner);
          if (!b) {
            b = { writes: 0, bytes: 0, totalMs: 0, maxMs: 0 };
            self._storage.set(owner, b);
          }
          b.writes++;
          b.bytes += (typeof value === "string" ? value.length : 0);
          b.totalMs += ms;
          if (ms > b.maxMs) b.maxMs = ms;
          if (ms >= 1) self._dirty = true;
        }
      };
      o.storageProto = proto;
    } catch (_) {
      o.setItem = null;
    }
  }

  // Network per plugin (remote asset fetches, API calls) + timer leak gauge
  // + BdApi.DOM style injection symmetry (convention R10).
  _installMiscWraps() {
    const self = this;
    const o = this._originals;

    if (typeof window.fetch === "function") {
      o.fetch = window.fetch;
      window.fetch = function (...args) {
        if (self._stopped) return o.fetch.apply(window, args);
        const owner = self._ownerFromStack();
        if (owner === "discord/other") return o.fetch.apply(window, args);
        const t0 = performance.now();
        const p = o.fetch.apply(window, args);
        try {
          return p.finally(() => {
            const b = self._netGauge.get(owner) || { calls: 0, totalMs: 0 };
            b.calls++;
            b.totalMs += performance.now() - t0;
            self._netGauge.set(owner, b);
          });
        } catch (_) {
          return p;
        }
      };
    }

    o.clearInterval = window.clearInterval;
    o.clearTimeout = window.clearTimeout;
    const countCleared = (owner) => {
      const g = self._timerGauge.get(owner) || { created: 0, cleared: 0 };
      g.cleared++;
      self._timerGauge.set(owner, g);
    };
    window.clearInterval = function (id) {
      if (!self._stopped) {
        const owner = self._ownerFromStack();
        if (owner !== "discord/other") countCleared(owner);
      }
      return o.clearInterval.call(window, id);
    };
    window.clearTimeout = function (id) {
      if (!self._stopped) {
        const owner = self._ownerFromStack();
        if (owner !== "discord/other") countCleared(owner);
      }
      return o.clearTimeout.call(window, id);
    };

    try {
      const dom = BdApi.DOM;
      if (dom && typeof dom.addStyle === "function") {
        o.addStyle = dom.addStyle.bind(dom);
        o.removeStyle = typeof dom.removeStyle === "function" ? dom.removeStyle.bind(dom) : null;
        o.bdDom = dom;
        dom.addStyle = (id, css) => {
          if (!self._stopped) {
            const owner = self._ownerFromStack();
            const g = self._cssGauge.get(owner) || { added: 0, removed: 0, bytes: 0 };
            g.added++;
            g.bytes += typeof css === "string" ? css.length : 0;
            self._cssGauge.set(owner, g);
            self._auditCss(owner, css);
          }
          return o.addStyle(id, css);
        };
        if (o.removeStyle) {
          dom.removeStyle = (id) => {
            if (!self._stopped) {
              const owner = self._ownerFromStack();
              const g = self._cssGauge.get(owner) || { added: 0, removed: 0, bytes: 0 };
              g.removed++;
              self._cssGauge.set(owner, g);
            }
            return o.removeStyle(id);
          };
        }
      }
    } catch (_) { /* BdApi.DOM shape differs — skip */ }
  }

  // Expensive-selector audit. Style-recalc cost scales with selector work,
  // and LoAF attributes multi-second forced style/layout to Discord's own
  // code — which OUR selectors can inflate. :has() re-evaluates on subtree
  // changes; [class*=] substring-matches every candidate; bare universal
  // touches everything. Counted at inject time (once), never per frame.
  // Scan INJECTED <style> elements directly instead of relying on wrapping
  // BdApi.DOM.addStyle (2026-07-30: that wrap silently failed — the audit
  // section never appeared — almost certainly because BdApi methods are
  // non-writable, exactly like BdApi.Data.save). Reading the live DOM works
  // regardless of how the CSS got there, and BD's convention of naming the
  // style element after the plugin gives us attribution for free.
  _scanInjectedCss() {
    const found = new Map();
    let scanned = 0;
    try {
      for (const el of document.querySelectorAll("style[id]")) {
        const id = el.id || "";
        const css = el.textContent || "";
        if (!css) continue;
        scanned++;
        // "EquipmentManager-styles" / "shadow-senses-css" / "SoloLevelingTheme"
        let owner = id.replace(/[-_]?(styles?|css)$/i, "").trim() || id;
        this._auditCss(owner, css, found);
      }
    } catch (_) { /* best-effort */ }
    this._cssScanned = scanned;
    return found;
  }

  _auditCss(owner, css, target) {
    if (typeof css !== "string" || !css) return;
    const map = target || (this._cssAudit || (this._cssAudit = new Map()));
    const a = map.get(owner) || { rules: 0, has: 0, contains: 0, universal: 0, deep: 0, bytes: 0 };
    a.bytes += css.length;
    // Strip /* */ comments FIRST (2026-07-30): the first run reported 162
    // "universal" selectors for a token file with none — every comment's
    // closing " */" matched the universal pattern, and comment prose inflated
    // the deep-chain count. Measuring the artifact, not the CSS.
    css = css.replace(/\/\*[\s\S]*?\*\//g, " ");
    a.rules += (css.match(/\{/g) || []).length;
    a.has += (css.match(/:has\(/g) || []).length;
    a.contains += (css.match(/\[class\*=/g) || []).length;
    a.universal += (css.match(/(^|[\s,>+~])\*(?![\w-])/g) || []).length;
    for (const chunk of css.split("}")) {
      const sel = (chunk.split("{")[0] || "").trim();
      if (!sel || sel.startsWith("@")) continue;
      const parts = sel.split(/\s+/).filter((x) => x && !",>+~".includes(x));
      if (parts.length >= 4) a.deep++;
    }
    map.set(owner, a);
  }

  // Trend sampling — a rising FLOOR across flushes is how slow leaks reveal
  // themselves. Single-point heap/DOM numbers can't separate "busy now" from
  // "never releases".
  _sampleTrend() {
    try {
      const mem = performance.memory;
      let listeners = 0;
      for (const g of this._domGauge.values()) listeners += g.adds - g.removes;
      this._trend.push({
        t: Date.now(),
        heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
        domNodes: document.getElementsByTagName("*").length,
        listeners,
      });
      if (this._trend.length > 120) this._trend.shift();
    } catch (_) { /* best-effort */ }
  }

  // Per-plugin DOM footprint by id/class prefix — catches element leaks the
  // listener gauge cannot see.
  _countPluginDom() {
    const out = new Map();
    const probes = [
      ["ShadowArmy", "[id^='shadow-army'],[class^='shadow-army']"],
      ["ShadowSenses", "[id^='shadow-senses'],[class^='shadow-senses'],[class^='ss-']"],
      ["ShadowExchange", "[id^='se-'],[class^='se-']"],
      ["Dungeons", "[id^='dungeon'],[class^='dungeon']"],
      ["CriticalHit", "[class^='crit-']"],
      ["SoloLevelingToasts", "[class^='sl-toast'],[id^='sl-toast']"],
      ["RulersAuthority", "[id^='ra-'],[class^='ra-']"],
      ["HSLDockAutoHide", "[class^='sl-hsl'],[class^='sl-dock']"],
      ["EquipmentManager", "[id^='eq-'],[class^='eq-']"],
      ["ItemVault", "[id^='itemvault'],[class^='itemvault']"],
      ["ShadowRecon", "[id^='shadow-recon'],[class^='recon-']"],
    ];
    for (const [name, sel] of probes) {
      try {
        const n = document.querySelectorAll(sel).length;
        if (n > 0) out.set(name, n);
      } catch (_) { /* skip */ }
    }
    return out;
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
    if (this._lastCpu !== null) {
      lines.push(`Renderer process CPU: ${this._lastCpu.toFixed(1)}% of one core (avg since previous flush; whole renderer — Discord + all plugins)`);
    }
    // Load context — frame/lag stats are meaningless without knowing what
    // the session was DOING (a heavy dungeon vs idle differ 10x). Makes
    // before/after comparisons across sessions valid.
    try {
      const dgn = typeof BdApi !== "undefined" ? BdApi.Plugins?.get?.("Dungeons")?.instance : null;
      const activeDungeons = dgn?.activeDungeons?.size;
      const mc = this._dispatchByAction.get("MESSAGE_CREATE");
      const mcCalls = mc ? mc.calls : 0;
      const mcDelta = mcCalls - (this._prevMcCalls || 0);
      this._prevMcCalls = mcCalls;
      lines.push(
        `Load context: active dungeons ${activeDungeons ?? "n/a"} | messages ~${mcDelta} this window, ${mcCalls} total (~${(mcCalls / (uptimeMs / 60000)).toFixed(0)}/min)`
      );
    } catch (_) {}
    lines.push("");

    // Per-plugin attribution
    lines.push("── PER-PLUGIN ATTRIBUTION (work registered after this plugin started) ──");
    lines.push("plugin                    kind      calls     total ms    max ms   >50ms   ~share of uptime");
    const rows = [];
    for (const [owner, kinds] of this._byPlugin) {
      for (const kind of KINDS) {
        const b = kinds[kind];
        if (!b || b.calls === 0) continue;
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
        `${r.owner.padEnd(25)} ${r.kind.padEnd(9)} ${String(r.calls).padStart(8)} ${this._fmtMs(r.totalMs).padStart(11)} ${this._fmtMs(r.maxMs).padStart(9)} ${String(r.longCalls || 0).padStart(6)}   ${share}%`
      );
    }
    lines.push("");

    // "What happens at runtime": which FUNCTIONS burn the time, per plugin.
    const sites = [...this._bySite.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, TOP_SITES_SHOWN);
    if (sites.length > 0) {
      lines.push(`── TOP CALLBACK SITES (top ${TOP_SITES_SHOWN} by total ms — plugin × kind × function) ──`);
      for (const s of sites) {
        const avg = s.totalMs / s.calls;
        lines.push(
          `${s.owner.padEnd(22)} ${s.kind.padEnd(9)} ${String(s.site).slice(0, 44).padEnd(45)} ${String(s.calls).padStart(8)} ${this._fmtMs(s.totalMs).padStart(10)}ms  avg ${this._fmtMs(avg)}ms  max ${this._fmtMs(s.maxMs)}ms`
        );
      }
      lines.push("");
    }

    // IDB transaction creation counts — walk-frequency, straight up:
    // "which function opens how many transactions per minute".
    if (this._txnStats.size > 0) {
      const txns = [...this._txnStats.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_TXN_SHOWN);
      lines.push(`── IDB TRANSACTIONS CREATED (top ${TOP_TXN_SHOWN} — plugin × creating function) ──`);
      for (const [key, count] of txns) {
        const perMin = (count / (uptimeMs / 60000)).toFixed(1);
        lines.push(`${key.slice(0, 70).padEnd(71)} ${String(count).padStart(8)}  (~${perMin}/min)`);
      }
      lines.push("");
    }

    // ShadowArmy _withStore caller counts (in-plugin probe — the only place
    // the async-cut stack still shows the true caller). Names the function
    // driving store-transaction volume definitively.
    try {
      const saCallers = window.__SA_STORE_CALLERS;
      if (saCallers && saCallers.size > 0) {
        lines.push("── SHADOWARMY _withStore CALLERS (in-plugin probe, true sync callers) ──");
        for (const [key, count] of [...saCallers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
          const perMin = (count / (uptimeMs / 60000)).toFixed(1);
          lines.push(`${key.slice(0, 60).padEnd(61)} ${String(count).padStart(8)}  (~${perMin}/min)`);
        }
        lines.push("");
      }
    } catch (_) {}

    // CriticalHit crit-consumption probe (in-plugin, 2026-07-30). Traces each
    // crit from queue to animation mount. A run ending in anything other than
    // anim:MOUNTED names the exact stage that dropped it.
    try {
      const chTrace = window.__CH_CRIT_TRACE;
      if (Array.isArray(chTrace) && chTrace.length > 0) {
        lines.push("── CRITICALHIT CRIT TRACE (queue -> animation, newest last) ──");
        const byId = new Map();
        for (const e of chTrace) {
          if (!byId.has(e.id)) byId.set(e.id, []);
          byId.get(e.id).push(e);
        }
        for (const [id, events] of [...byId.entries()].slice(-10)) {
          const t0 = events[0].at;
          const chain = events
            .map((e) => `${e.stage}${e.extra ? `(${e.extra})` : ""}+${e.at - t0}ms`)
            .join(" -> ");
          const mounted = events.some((e) => e.stage === "anim:MOUNTED");
          lines.push(`  ...${id} ${mounted ? "OK  " : "FAIL"} ${chain}`);
        }
        const total = byId.size;
        const ok = [...byId.values()].filter((ev) =>
          ev.some((e) => e.stage === "anim:MOUNTED")
        ).length;
        lines.push(`  ${ok}/${total} traced crits reached anim:MOUNTED`);
        lines.push("");
      }
    } catch (_) {}

    // Wrapped DOM listener gauge — adds vs removes per plugin. A steadily
    // growing live count = listener leak.
    if (this._domGauge.size > 0) {
      lines.push("── DOM LISTENERS (wrapped adds/removes per plugin — growing 'live' = leak) ──");
      for (const [owner, g] of [...this._domGauge.entries()].sort((a, b) => (b[1].adds - b[1].removes) - (a[1].adds - a[1].removes))) {
        lines.push(`${owner.padEnd(25)} adds ${String(g.adds).padStart(6)}  removes ${String(g.removes).padStart(6)}  live ~${g.adds - g.removes}`);
      }
      lines.push("");
    }

    // Totals per plugin (the headline table)
    const totals = [];
    for (const [owner, kinds] of this._byPlugin) {
      let totalMs = 0;
      let maxMs = 0;
      let longCalls = 0;
      for (const k of KINDS) {
        const b = kinds[k];
        if (!b) continue;
        totalMs += b.totalMs;
        if (b.maxMs > maxMs) maxMs = b.maxMs;
        longCalls += b.longCalls || 0;
      }
      if (totalMs > 0) totals.push({ owner, totalMs, maxMs, longCalls });
    }
    totals.sort((a, b) => b.totalMs - a.totalMs);
    lines.push("── HEADLINE: total attributed main-thread ms per plugin ──");
    for (const t of totals) {
      const blocks = t.longCalls > 0 ? ` | ${t.longCalls} callbacks >50ms` : "";
      lines.push(`${t.owner.padEnd(25)} ${this._fmtMs(t.totalMs).padStart(11)}ms   (worst single callback ${this._fmtMs(t.maxMs)}ms${blocks})`);
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
      .slice(0, TOP_FLUX_SHOWN);
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
      this._pendingBurstMovers = movers;

      // Per-SITE window movers — what exactly is hot right now.
      if (this._prevSiteSnap) {
        const siteMovers = [];
        for (const [key, s] of this._bySite) {
          const delta = s.totalMs - (this._prevSiteSnap.get(key) || 0);
          if (delta >= 1) siteMovers.push({ s, delta });
        }
        siteMovers.sort((a, b) => b.delta - a.delta);
        if (siteMovers.length > 0) {
          lines.push(`  hot sites this window (top ${TOP_WINDOW_SITES}):`);
          for (const { s, delta } of siteMovers.slice(0, TOP_WINDOW_SITES)) {
            lines.push(`  ${s.owner.padEnd(22)} ${s.kind.padEnd(9)} ${String(s.site).slice(0, 40).padEnd(41)} +${this._fmtMs(delta)}ms`);
          }
        }
      }
      lines.push("");
    }
    this._prevSnap = snap;
    const siteSnap = new Map();
    for (const [key, s] of this._bySite) siteSnap.set(key, s.totalMs);
    this._prevSiteSnap = siteSnap;

    // Long Animation Frames — the browser's OWN attribution. Catches script
    // scheduled through paths we never wrapped AND the style/layout cost that
    // JS wrapping can never see.
    if (this._loaf) {
      if (!this._loaf.supported) {
        lines.push("── LONG ANIMATION FRAMES ── (entry type 'long-animation-frame' UNSUPPORTED in this renderer — section unavailable)");
        lines.push("");
      } else {
        lines.push("── LONG ANIMATION FRAMES (browser-attributed; includes style/layout) ──");
        lines.push(
          `Frames >50ms: ${this._loaf.frames} | total blocking ${this._fmtMs(this._loaf.totalBlockingMs)}ms | worst frame ${this._fmtMs(this._loaf.worstMs)}ms | style+layout ${this._fmtMs(this._loaf.styleLayoutMs)}ms`
        );
        const scripts = [...this._loaf.byScript.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, 15);
        if (scripts.length > 0) {
          lines.push("owner                  function                             calls    total ms   forced style/layout");
          for (const sc of scripts) {
            lines.push(
              `${sc.owner.padEnd(22)} ${String(sc.fn).slice(0, 34).padEnd(35)} ${String(sc.calls).padStart(7)} ${this._fmtMs(sc.totalMs).padStart(10)}ms ${this._fmtMs(sc.forcedStyleMs).padStart(12)}ms`
            );
          }
        }
        lines.push("");
      }
    }

    // Slow interactions (Event Timing) — user-perceived freezes with target.
    if (this._eventTimingSupported === false) {
      lines.push("── SLOW INTERACTIONS ── (entry type 'event' UNSUPPORTED in this renderer — section unavailable)");
      lines.push("");
    } else if (this._slowEvents.size > 0) {
      lines.push("── SLOW INTERACTIONS (>50ms handler+render, Event Timing API) ──");
      for (const [key, b] of [...this._slowEvents.entries()].sort((a, b) => b[1].maxMs - a[1].maxMs).slice(0, 12)) {
        lines.push(`${key.padEnd(71)} ${String(b.count).padStart(5)}x  worst ${this._fmtMs(b.maxMs)}ms  total ${this._fmtMs(b.totalMs)}ms`);
      }
      lines.push("");
    }

    // Synchronous localStorage writes (BdApi.Data is backed by it — R4).
    if (this._bdDataWrapOk === false) {
      lines.push(`── SYNCHRONOUS DISK WRITES ── BdApi.Data.save wrap FAILED (frozen); fs.writeFileSync fallback: ${this._fsWrapOk ? "ACTIVE" : "ALSO FAILED"}`);
      lines.push("  (property non-writable/accessor-defined — this section would otherwise read as a");
      lines.push("   false all-clear. Treat disk-write cost as UNMEASURED, not zero.)");
      lines.push("");
    } else if (this._storage.size === 0) {
      lines.push("── SYNCHRONOUS DISK WRITES ── none recorded this session (wrap verified active)");
      lines.push("");
    }
    if (this._storage.size > 0) {
      lines.push("── SYNCHRONOUS DISK WRITES (BdApi.Data.save = fs.writeFileSync of the WHOLE config) ──");
      for (const [owner, b] of [...this._storage.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs)) {
        const perMin = (b.writes / (uptimeMs / 60000)).toFixed(1);
        const keys = b.keys ? [...b.keys].slice(0, 4).join(",") : "";
        lines.push(
          `${owner.padEnd(22)} ${String(b.writes).padStart(6)} saves (~${perMin}/min) ${this._fmtMs(b.totalMs).padStart(9)}ms  max ${this._fmtMs(b.maxMs)}ms  keys: ${keys}`
        );
      }
      lines.push("  (each save re-serializes + rewrites that plugin's ENTIRE config file, 4-space pretty-printed)");
      lines.push("");
    }

    // Leak gauges — unbounded growth in either column is the signal.
    const gaugeRows = [];
    for (const [owner, g] of this._timerGauge) {
      gaugeRows.push({ owner, timers: `${g.created}/${g.cleared}`, live: g.created - g.cleared });
    }
    if (gaugeRows.length > 0) {
      lines.push("── LEAK GAUGES (created/cleared — steadily growing 'live' = leak) ──");
      lines.push("plugin                    timers made/cleared   live   listeners add/remove   css add/remove   net calls");
      for (const r of gaugeRows.sort((a, b) => b.live - a.live).slice(0, 20)) {
        const d = this._domGauge.get(r.owner);
        const c = this._cssGauge.get(r.owner);
        const n = this._netGauge.get(r.owner);
        lines.push(
          `${r.owner.padEnd(25)} ${r.timers.padStart(17)} ${String(r.live).padStart(6)}   ${(d ? `${d.adds}/${d.removes}` : "-").padStart(18)}   ${(c ? `${c.added}/${c.removed}` : "-").padStart(14)}   ${(n ? `${n.calls} (${this._fmtMs(n.totalMs)}ms)` : "-").padStart(9)}`
        );
      }
      lines.push("");
    }

    if (this._listenerSites.size > 0) {
      const top = [...this._listenerSites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (top[0][1] > 5) {
        lines.push("── TOP LISTENER-ADD SITES (high counts = re-subscribe churn or leak) ──");
        for (const [key, count] of top) {
          lines.push(`${key.slice(0, 70).padEnd(71)} ${String(count).padStart(6)} adds`);
        }
        lines.push("");
      }
    }

    // Trend lines — slope, not snapshots. This is the only section that can
    // distinguish a leak from a busy moment.
    if (this._trend.length >= 3) {
      const first = this._trend[0];
      const last = this._trend[this._trend.length - 1];
      const spanMin = Math.max(0.5, (last.t - first.t) / 60000);
      const fmtSlope = (a, b, unit) => {
        if (a == null || b == null) return "n/a";
        const d = b - a;
        const per = d / spanMin;
        const dir = d > 0 ? "+" : "";
        return `${a}${unit} -> ${b}${unit} (${dir}${d}${unit}, ${dir}${per.toFixed(1)}${unit}/min)`;
      };
      lines.push(`── TRENDS over ${spanMin.toFixed(1)} min (${this._trend.length} samples — rising floor = leak) ──`);
      lines.push(`JS heap:    ${fmtSlope(first.heapMB, last.heapMB, "MB")}`);
      lines.push(`DOM nodes:  ${fmtSlope(first.domNodes, last.domNodes, "")}`);
      lines.push("            (Discord's message list dominates this — cross-check DOM FOOTPRINT below;");
      lines.push("             plugin-owned element counts are the per-plugin leak signal, not this total)");
      lines.push(`Live listeners (adds-removes): ${fmtSlope(first.listeners, last.listeners, "")}`);
      const heaps = this._trend.map((x) => x.heapMB).filter((x) => x != null);
      if (heaps.length >= 4) {
        // Compare post-GC FLOORS, not averages (corrected 2026-07-30): heap
        // sawtooths hard, so half-averages flagged "RISING" on a session whose
        // first and last samples were both low. Only the floor — the level GC
        // can no longer reclaim below — indicates retention.
        const mid = Math.floor(heaps.length / 2);
        const floorA = Math.min(...heaps.slice(0, mid));
        const floorB = Math.min(...heaps.slice(mid));
        const peakA = Math.max(...heaps.slice(0, mid));
        const peakB = Math.max(...heaps.slice(mid));
        lines.push(`  heap FLOOR (post-GC, the leak signal): ${floorA}MB -> ${floorB}MB ` +
          `— ${floorB - floorA > 40 ? "RISING (retention — investigate)" : "stable (GC reclaims to the same level)"}`);
        lines.push(`  heap peak (churn, NOT a leak signal): ${peakA}MB -> ${peakB}MB`);
      }
      lines.push("");
    }

    // Per-plugin DOM footprint.
    const domCounts = this._countPluginDom();
    if (domCounts.size > 0) {
      lines.push("── DOM FOOTPRINT (elements matching each plugin's id/class prefix) ──");
      for (const [name, n] of [...domCounts.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`${name.padEnd(25)} ${String(n).padStart(6)} elements`);
      }
      lines.push("");
    }

    // Expensive-selector audit.
    const cssScan = this._scanInjectedCss();
    if (cssScan.size === 0) {
      lines.push(`── CSS SELECTOR AUDIT ── no injected <style id> elements found (scanned ${this._cssScanned || 0}) — section unavailable`);
      lines.push("");
    }
    if (cssScan.size > 0) {
      const rows = [...cssScan.entries()]
        .map(([owner, a]) => ({ owner, ...a, score: a.has * 3 + a.contains + a.universal * 5 + a.deep }))
        .sort((a, b) => b.score - a.score);
      lines.push("── CSS SELECTOR AUDIT (style-recalc pressure; :has re-evaluates on subtree changes) ──");
      lines.push("plugin                     rules   :has()  [class*=]  universal  deep(4+)   KB");
      for (const r of rows.slice(0, 12)) {
        lines.push(
          `${r.owner.padEnd(25)} ${String(r.rules).padStart(6)} ${String(r.has).padStart(8)} ${String(r.contains).padStart(10)} ${String(r.universal).padStart(10)} ${String(r.deep).padStart(9)} ${String(Math.round(r.bytes / 1024)).padStart(5)}`
        );
      }
      lines.push("");
    }

    // LoAF attribution verdict — states which case we're in.
    if (this._loaf && this._loaf.supported) {
      const p = this._loafProbe;
      if (p.pluginRows === 0 && p.unresolved > 0) {
        lines.push("── LoAF ATTRIBUTION VERDICT ──");
        lines.push(`No plugin script has EVER resolved in ${p.unresolved} attributed script entries.`);
        lines.push("Sample sourceURLs actually seen:");
        for (const u of p.sampleUrls) lines.push(`  ${u}`);
        lines.push("If these are all discord.com/assets or empty, LoAF cannot see BD-injected");
        lines.push("scripts and this section is BLIND to the suite — do NOT read it as 'plugins are clean'.");
        lines.push("");
      } else if (p.pluginRows > 0) {
        lines.push(`── LoAF attribution VERIFIED WORKING: ${p.pluginRows} plugin-attributed script entries ──`);
        lines.push("");
      }
    }

    lines.push("── LIMITATIONS ──");
    lines.push("- Attribution only sees timers/rAF/observers/flux/IDB/DOM-listener work registered");
    lines.push("  AFTER this plugin started. It loads first alphabetically, so a full Discord");
    lines.push("  restart (Cmd+Q) gives complete coverage.");
    lines.push("- Module-scope aliases of wrapped functions captured pre-wrap bypass attribution.");
    lines.push("- async/await continuations (microtasks) and Promise callbacks are not wrappable.");
    lines.push("- IDB handlers attached via addEventListener('success') (vs .onsuccess) aren't timed.");
    lines.push("- Per-plugin CPU: no per-JS-context CPU API exists; the attributed-ms tables ARE the");
    lines.push("  per-plugin split of main-thread CPU. Renderer CPU line above is the whole process.");
    lines.push("- 'discord/other' rows = work whose registration stack showed no .plugin.js frame.");
    lines.push("- SHARED-SINGLETON MISATTRIBUTION (verified 2026-07-30): work inside a shared");
    lines.push("  window.__SL_* hub (ToolbarHub fireAll, LayoutObserverBus, DomBus) is attributed to");
    lines.push("  whichever plugin WON THE STARTUP RACE to create the singleton — not to the");
    lines.push("  subscriber whose callback actually cost the time. A hub row naming one plugin means");
    lines.push("  'this hub', not 'this plugin'. Check the hub's subscriber list before blaming.");
    lines.push("- STILL NOT MEASURABLE from inside the renderer, by design of the platform:");
    lines.push("  GPU/compositor time, per-plugin heap share (measureUserAgentSpecificMemory needs");
    lines.push("  cross-origin isolation), work inside Discord's own native/WASM code, and cost in");
    lines.push("  other processes (main, GPU, network). The Long Animation Frames section above is");
    lines.push("  the widest net available in-renderer: it sees script + style + layout regardless");
    lines.push("  of how the work was scheduled, including paths this plugin never wrapped.");

    return lines.join("\n") + "\n";
  }

  // A transient spike (the 155/min full-store-walk burst) is invisible in a
  // report that gets overwritten every 30s. When a plugin's window delta
  // crosses the threshold, freeze a timestamped copy that is NEVER
  // overwritten, so the evidence outlives the moment.
  _maybeCaptureBurst(report, movers) {
    if (this._burstsWritten >= 12) return; // bound disk use per session
    const worst = movers && movers[0];
    if (!worst || worst.delta < 2500) return; // >2.5s attributed in one ~30s window
    this._burstsWritten++;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const file = path.join(
      BdApi.Plugins.folder,
      `AAPerfSentinel-burst-${stamp}-${worst.owner}.log`
    );
    const header =
      `BURST CAPTURE — ${worst.owner} accrued ${Math.round(worst.delta)}ms in one window\n` +
      `Captured because it crossed the 2500ms threshold. This file is NOT overwritten.\n\n`;
    try {
      fs.writeFile(file, header + report, () => {});
    } catch (_) { /* best-effort */ }
  }

  _flush(force = false) {
    if (!force && !this._dirty) return;
    this._dirty = false;
    // Whole-renderer CPU since the previous getCPUUsage() call (Electron API;
    // percent of one core). Sampled per flush so the report's window sections
    // and this number cover the same span.
    try {
      if (typeof process !== "undefined" && typeof process.getCPUUsage === "function") {
        this._lastCpu = process.getCPUUsage().percentCPUUsage ?? null;
      }
    } catch (_) {
      this._lastCpu = null;
    }
    this._sampleTrend();
    const report = this._buildReport();
    if (this._pendingBurstMovers) {
      this._maybeCaptureBurst(report, this._pendingBurstMovers);
      this._pendingBurstMovers = null;
    }
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
    this._installIdbWraps();
    this._installDomWrap();
    this._installLongTaskObserver();
    this._installLoafObserver();
    this._installEventTimingObserver();
    this._installBdDataWrap();
    this._installFsWrap();
    this._installStorageWrap();
    this._installMiscWraps();
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
    if (o.idbTransaction) IDBDatabase.prototype.transaction = o.idbTransaction;
    if (o.idbReqSuccess) Object.defineProperty(IDBRequest.prototype, "onsuccess", o.idbReqSuccess);
    if (o.idbReqError) Object.defineProperty(IDBRequest.prototype, "onerror", o.idbReqError);
    if (o.idbTxnComplete) Object.defineProperty(IDBTransaction.prototype, "oncomplete", o.idbTxnComplete);
    if (o.idbTxnAbort) Object.defineProperty(IDBTransaction.prototype, "onabort", o.idbTxnAbort);
    if (o.addEventListener) EventTarget.prototype.addEventListener = o.addEventListener;
    if (o.removeEventListener) EventTarget.prototype.removeEventListener = o.removeEventListener;
    if (o.bdDataSave && o.bdData) { try { o.bdData.save = o.bdDataSave; } catch (_) {} }
    if (o.writeFileSync) fs.writeFileSync = o.writeFileSync;
    if (o.setItem && o.storageProto) o.storageProto.setItem = o.setItem;
    if (o.fetch) window.fetch = o.fetch;
    if (o.clearInterval) window.clearInterval = o.clearInterval;
    if (o.clearTimeout) window.clearTimeout = o.clearTimeout;
    if (o.addStyle && o.bdDom) o.bdDom.addStyle = o.addStyle;
    if (o.removeStyle && o.bdDom) o.bdDom.removeStyle = o.removeStyle;
    for (const obs of [this._loafObserver, this._eventObserver]) {
      if (obs) { try { obs.disconnect(); } catch (_) {} }
    }
    this._loafObserver = null;
    this._eventObserver = null;

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
