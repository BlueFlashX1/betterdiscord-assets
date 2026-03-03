#!/usr/bin/env node

/**
 * Tiny + Small + Medium plugin harmony harness.
 * Purpose: catch real lifecycle conflicts while filtering Node-only false negatives.
 */

const path = require("path");

const PLUGIN_DIR = path.resolve(__dirname, "../plugins");

const TINY_PLUGINS = [
  "AnimateTest",
  "DraggableTest",
  "TooltipTest",
  "ScrollSpyTest",
  "HotkeysTest",
  "MutationScannerTest",
  "CustomEventsTest",
  "EventDelegationTest",
  "TestPlugin",
];

const SMALL_PLUGINS = [
  "ChatNavArrows",
  "SystemWindow",
  "UserPanelDockMover",
  "HSLWheelBridge",
];

const MEDIUM_PLUGINS = [
  "LevelProgressBar",
  "ShadowExchange",
  "ShadowRecon",
  "TitleManager",
  "CSSPicker",
  "HSLDockAutoHide",
  "ShadowStep",
  "Stealth",
];

const DEFAULT_PLUGIN_FILES = [...TINY_PLUGINS, ...SMALL_PLUGINS, ...MEDIUM_PLUGINS].map(
  (name) => `${name}.plugin.js`
);

function normalizePluginFileName(nameOrFile) {
  if (!nameOrFile) return null;
  const trimmed = String(nameOrFile).trim();
  if (!trimmed) return null;
  if (trimmed.endsWith(".plugin.js")) return trimmed;
  return `${trimmed}.plugin.js`;
}

function resolvePluginFilesFromArgs() {
  const pluginsArg = process.argv.find((arg) => arg.startsWith("--plugins="));
  if (!pluginsArg) return DEFAULT_PLUGIN_FILES;

  const csv = pluginsArg.slice("--plugins=".length);
  const files = csv
    .split(",")
    .map((entry) => normalizePluginFileName(entry))
    .filter(Boolean);

  return files.length ? files : DEFAULT_PLUGIN_FILES;
}

const PLUGIN_FILES = resolvePluginFilesFromArgs();

function createStyleDecl() {
  const map = new Map();
  return {
    setProperty(key, value) {
      map.set(String(key), String(value));
    },
    getPropertyValue(key) {
      return map.get(String(key)) || "";
    },
    removeProperty(key) {
      const prev = map.get(String(key)) || "";
      map.delete(String(key));
      return prev;
    },
  };
}

class EventTargetShim {
  constructor() {
    this._listeners = new Map();
    this._abortUnsubs = new Map();
  }

  addEventListener(type, cb, options) {
    if (!type || typeof cb !== "function") return;
    const list = this._listeners.get(type) || [];
    list.push(cb);
    this._listeners.set(type, list);

    const signal = options && typeof options === "object" ? options.signal : null;
    if (signal && typeof signal.addEventListener === "function") {
      const abortHandler = () => this.removeEventListener(type, cb);
      signal.addEventListener("abort", abortHandler, { once: true });
      this._abortUnsubs.set(cb, () => {
        try {
          signal.removeEventListener("abort", abortHandler);
        } catch (_) {}
      });
    }
  }

  removeEventListener(type, cb) {
    const list = this._listeners.get(type) || [];
    this._listeners.set(
      type,
      list.filter((fn) => fn !== cb)
    );
    const unsubAbort = this._abortUnsubs.get(cb);
    if (unsubAbort) {
      unsubAbort();
      this._abortUnsubs.delete(cb);
    }
  }

  dispatchEvent(evt) {
    const type = evt?.type;
    if (!type) return;
    const list = this._listeners.get(type) || [];
    for (const fn of list.slice()) {
      try {
        fn(evt);
      } catch (_) {}
    }
  }

  listenerCount(type) {
    return (this._listeners.get(type) || []).length;
  }
}

class MockElement extends EventTargetShim {
  constructor(tag = "div", byId = null) {
    super();
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.isConnected = false;
    this.attributes = {};
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.innerText = "";
    this.value = "";
    this.checked = false;
    this.role = null;
    this.style = createStyleDecl();
    this._byId = byId;
    if (this.tagName === "CANVAS") {
      this.width = 0;
      this.height = 0;
      this.getContext = () => createMockCanvasContext();
      this.toDataURL = () => "data:image/png;base64,";
    }
    const classSet = new Set();
    this.classList = {
      add: (...values) => {
        for (const value of values) {
          if (value) classSet.add(value);
        }
      },
      remove: (...values) => {
        for (const value of values) classSet.delete(value);
      },
      contains: (value) => classSet.has(value),
      toggle: (value, force) => {
        if (force === undefined) {
          if (classSet.has(value)) {
            classSet.delete(value);
            return false;
          }
          classSet.add(value);
          return true;
        }
        if (force) classSet.add(value);
        else classSet.delete(value);
        return force;
      },
      toString: () => [...classSet].join(" "),
    };
  }

  set id(value) {
    this._id = value;
    if (this._byId && value) this._byId.set(value, this);
  }

  get id() {
    return this._id;
  }

  setAttribute(key, value) {
    const normalizedKey = String(key);
    const normalizedValue = String(value);
    this.attributes[normalizedKey] = normalizedValue;
    if (normalizedKey === "id") this.id = normalizedValue;
    if (normalizedKey === "class") {
      this.className = normalizedValue;
      for (const cls of normalizedValue.split(/\s+/).filter(Boolean)) {
        this.classList.add(cls);
      }
    }
  }

  getAttribute(key) {
    return this.attributes[key] ?? null;
  }

  hasAttribute(key) {
    return Object.prototype.hasOwnProperty.call(this.attributes, key);
  }

  removeAttribute(key) {
    delete this.attributes[key];
    if (key === "id" && this._byId && this.id) {
      this._byId.delete(this.id);
    }
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    child.isConnected = true;
    this.children.push(child);
    if (child.id && this._byId) this._byId.set(child.id, child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((node) => node !== child);
    if (child) {
      child.parentNode = null;
      child.isConnected = false;
      if (child.id && this._byId) this._byId.delete(child.id);
    }
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  contains(node) {
    if (!node) return false;
    if (node === this) return true;
    const stack = [...this.children];
    while (stack.length) {
      const next = stack.pop();
      if (next === node) return true;
      if (next.children?.length) stack.push(...next.children);
    }
    return false;
  }

  querySelector(selector) {
    if (selector === ".widget-header") {
      const stack = [...this.children];
      while (stack.length) {
        const next = stack.shift();
        if (
          String(next.className || "")
            .split(/\s+/)
            .includes("widget-header")
        ) {
          return next;
        }
        if (next.children?.length) stack.push(...next.children);
      }
      return null;
    }

    if (selector?.startsWith("#") && this._byId) {
      return this._byId.get(selector.slice(1)) || null;
    }

    return null;
  }

  querySelectorAll() {
    return [];
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20,
    };
  }

  closest() {
    return null;
  }

  focus() {}

  blur() {}

  set innerHTML(html) {
    this._innerHTML = String(html || "");
    this.children = [];
    if (this._innerHTML.includes("widget-header")) {
      const header = new MockElement("div", this._byId);
      header.className = "widget-header";
      header.classList.add("widget-header");
      this.appendChild(header);
      const body = new MockElement("div", this._byId);
      body.className = "widget-body";
      body.classList.add("widget-body");
      this.appendChild(body);
    }
  }

  get innerHTML() {
    return this._innerHTML || "";
  }
}

function createMockCanvasContext() {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: "",
    clearRect() {},
    fillRect() {},
    beginPath() {},
    closePath() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    drawImage() {},
    createImageData(width, height) {
      const w = Number(width) || 0;
      const h = Number(height) || 0;
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    putImageData() {},
    getImageData(width, height) {
      const w = Number(width) || 0;
      const h = Number(height) || 0;
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    measureText(text) {
      return { width: String(text || "").length * 8 };
    },
    fillText() {},
    strokeText() {},
  };
}

function createIndexedDbStub() {
  const storeRegistry = new Map();

  const makeRequest = (resultValue) => {
    const request = { result: resultValue, error: null, onsuccess: null, onerror: null };
    setTimeout(() => {
      if (typeof request.onsuccess === "function") {
        request.onsuccess({ target: request });
      }
    }, 0);
    return request;
  };

  const objectStore = {
    createIndex: () => {},
    index: () => ({
      get: () => makeRequest(null),
      getAll: () => makeRequest([]),
      openCursor: () => makeRequest(null),
    }),
    get: () => makeRequest(null),
    put: () => makeRequest(undefined),
    add: () => makeRequest(undefined),
    delete: () => makeRequest(undefined),
    clear: () => makeRequest(undefined),
    getAll: () => makeRequest([]),
    openCursor: () => makeRequest(null),
  };

  const transaction = {
    objectStore: () => objectStore,
  };

  const db = {
    objectStoreNames: {
      contains(name) {
        return storeRegistry.has(String(name));
      },
    },
    createObjectStore: (name) => {
      const key = String(name);
      storeRegistry.set(key, objectStore);
      return objectStore;
    },
    transaction: () => transaction,
    close: () => {},
  };

  return {
    open() {
      const request = { result: db, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => {
        if (typeof request.onupgradeneeded === "function") {
          request.onupgradeneeded({ target: request });
        }
        if (typeof request.onsuccess === "function") {
          request.onsuccess({ target: request });
        }
      }, 0);
      return request;
    },
    deleteDatabase() {
      return makeRequest(undefined);
    },
  };
}

function setupGlobalHarnessEnvironment() {
  const elementsById = new Map();

  const body = new MockElement("body", elementsById);
  body.id = "app-mount";
  const head = new MockElement("head", elementsById);

  const windowTarget = new EventTargetShim();
  const documentTarget = new EventTargetShim();

  const documentObj = Object.assign(documentTarget, {
    hidden: false,
    body,
    head,
    documentElement: new MockElement("html", elementsById),
    readyState: "complete",
    createElement: (tag) => new MockElement(tag, elementsById),
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: (selector) => {
      if (selector === "#app-mount") return body;
      if (selector === "head") return head;
      if (selector && (selector.includes("app_") || selector.includes("base_") || selector.includes("container_"))) {
        return body;
      }
      return null;
    },
    querySelectorAll: () => [],
    contains: (node) => body.contains(node) || head.contains(node),
  });

  const imageCtor = class ImageShim {
    constructor() {
      this._src = "";
      this.onload = null;
      this.onerror = null;
    }

    set src(value) {
      this._src = String(value || "");
      setTimeout(() => {
        if (typeof this.onload === "function") this.onload();
      }, 0);
    }

    get src() {
      return this._src;
    }
  };

  Object.assign(windowTarget, {
    document: documentObj,
    location: { href: "https://discord.com/channels/@me" },
    navigator: { userAgent: "node-harness" },
    Image: imageCtor,
  });

  global.window = windowTarget;
  global.document = documentObj;
  global.navigator = windowTarget.navigator;
  global.history = {
    pushState() {},
    replaceState() {},
  };
  window.history = global.history;

  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  global.requestAnimationFrame = window.requestAnimationFrame;
  global.cancelAnimationFrame = window.cancelAnimationFrame;

  global.Image = imageCtor;
  global.indexedDB = createIndexedDbStub();
  window.indexedDB = global.indexedDB;
  global.IDBKeyRange = {
    only(value) {
      return { __only: value };
    },
  };
  window.IDBKeyRange = global.IDBKeyRange;

  if (typeof global.structuredClone !== "function") {
    global.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  }

  global.MutationObserver = class {
    constructor() {}
    observe() {}
    disconnect() {}
  };
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  global.performance = global.performance || { now: () => Date.now() };

  global.localStorage = {
    _m: new Map(),
    getItem(key) {
      return this._m.has(key) ? this._m.get(key) : null;
    },
    setItem(key, value) {
      this._m.set(key, String(value));
    },
    removeItem(key) {
      this._m.delete(key);
    },
  };

  return { windowTarget, documentTarget };
}

function setupBdApiShim() {
  const dataStore = new Map();
  const styleStore = new Map();
  const pluginInstances = new Map();
  const noop = () => {};
  const unpatchNoop = () => noop;

  const webpackShim = {
    Stores: {
      UserStore: {
        getCurrentUser: () => ({ id: "u1" }),
        _dispatcher: { dispatch: noop, subscribe: noop, unsubscribe: noop },
      },
    },
    getStore: (name) => (name === "UserStore" ? { getCurrentUser: () => ({ id: "u1" }) } : null),
    getByKeys: () => null,
    getBySource: () => null,
    getWithKey: () => null,
    getModule: () => null,
    waitForModule: async () => null,
  };

  global.BdApi = {
    Plugins: {
      folder: PLUGIN_DIR,
      get: (name) => {
        const instance = pluginInstances.get(name);
        return instance ? { instance } : null;
      },
      isEnabled: (name) => pluginInstances.has(name),
      enable: noop,
      disable: noop,
    },
    Data: {
      load: (plugin, key) => dataStore.get(`${plugin}:${key}`) ?? null,
      save: (plugin, key, value) => dataStore.set(`${plugin}:${key}`, value),
      delete: (plugin, key) => dataStore.delete(`${plugin}:${key}`),
    },
    DOM: {
      addStyle: (id, css) => styleStore.set(id, String(css || "")),
      removeStyle: (id) => styleStore.delete(id),
      createElement: () => document.createElement("div"),
    },
    UI: {
      showToast: noop,
      alert: noop,
      showConfirmationModal: noop,
      buildSettingsPanel: () => ({ getElement: () => document.createElement("div") }),
    },
    showToast: noop,
    Webpack: webpackShim,
    React: {
      createElement: (...args) => ({ __el: args }),
      Component: class {},
      Fragment: "fragment",
      useState: (v) => [v, noop],
      useEffect: noop,
      useMemo: (fn) => fn(),
      useRef: (v) => ({ current: v }),
    },
    ReactDOM: {
      render: noop,
      unmountComponentAtNode: noop,
      createRoot: () => ({ render: noop, unmount: noop }),
    },
    ReactUtils: {
      getInternalInstance: () => null,
      findInTree: () => null,
      getOwnerInstance: () => null,
    },
    Patcher: {
      after: unpatchNoop,
      before: unpatchNoop,
      instead: unpatchNoop,
      unpatchAll: noop,
    },
    ContextMenu: {
      patch: unpatchNoop,
      unpatch: noop,
      buildItem: () => ({}),
      open: noop,
      close: noop,
    },
    Net: {
      fetch: async () => ({ ok: true, json: async () => ({}), text: async () => "" }),
    },
    findModuleByProps: () => null,
    findModule: () => null,
    loadData: (plugin, key) => dataStore.get(`${plugin}:${key}`) ?? null,
    saveData: (plugin, key, value) => dataStore.set(`${plugin}:${key}`, value),
    suppressErrors: (fn) => (...args) => {
      try {
        return fn(...args);
      } catch (_) {
        return undefined;
      }
    },
  };

  return { pluginInstances, styleStore };
}

function createSummary() {
  return {
    pluginCount: PLUGIN_FILES.length,
    loadedCount: 0,
    startedCount: 0,
    startFailCount: 0,
    stopFailCount: 0,
    loaderFallbackCount: 0,
    loaderFallbackPlugins: [],
    failures: [],
  };
}

function trackFailure(summary, pluginName, phase, error, counterKey) {
  summary[counterKey] += 1;
  summary.failures.push({
    plugin: pluginName,
    phase,
    error: error?.message || String(error),
  });
}

function isPromiseLike(value) {
  return value && typeof value.then === "function";
}

function loadPlugins(summary, pluginInstances) {
  const loaded = [];
  for (const file of PLUGIN_FILES) {
    const pluginName = file.replace(/\.plugin\.js$/, "");
    try {
      const PluginClass = require(path.join(PLUGIN_DIR, file));
      const instance = new PluginClass();
      if (instance?.constructor?.name === "LoaderErrorPlugin") {
        summary.loaderFallbackCount += 1;
        summary.loaderFallbackPlugins.push(pluginName);
      }
      loaded.push({ pluginName, instance });
      pluginInstances.set(pluginName, instance);
      summary.loadedCount += 1;
    } catch (error) {
      trackFailure(summary, pluginName, "load", error, "startFailCount");
    }
  }
  return loaded;
}

async function runLifecyclePhase({ plugins, phase, summary, reverse = false, successCounterKey = null }) {
  const ordered = reverse ? plugins.slice().reverse() : plugins;
  for (const { pluginName, instance } of ordered) {
    try {
      const result = instance?.[phase]?.();
      if (isPromiseLike(result)) await result;
      if (successCounterKey) summary[successCounterKey] += 1;
    } catch (error) {
      const counterKey = phase === "stop" ? "stopFailCount" : "startFailCount";
      trackFailure(summary, pluginName, phase, error, counterKey);
    }
  }
}

function finalizeSummary(summary, documentTarget, windowTarget, styleStore) {
  summary.docKeydownListenersAfterStop = documentTarget.listenerCount("keydown");
  summary.docInputListenersAfterStop = documentTarget.listenerCount("input");
  summary.windowPopstateListenersAfterStop = windowTarget.listenerCount("popstate");
  summary.styleCountAfterStop = styleStore.size;
}

function hasHardFailures(summary) {
  return (
    summary.startFailCount > 0 ||
    summary.stopFailCount > 0 ||
    summary.loaderFallbackCount > 0
  );
}

async function runHarness() {
  const { windowTarget, documentTarget } = setupGlobalHarnessEnvironment();
  const { pluginInstances, styleStore } = setupBdApiShim();
  const summary = createSummary();

  const loaded = loadPlugins(summary, pluginInstances);
  await runLifecyclePhase({
    plugins: loaded,
    phase: "start",
    summary,
    successCounterKey: "startedCount",
  });
  await runLifecyclePhase({
    plugins: loaded,
    phase: "stop",
    summary,
    reverse: true,
  });

  finalizeSummary(summary, documentTarget, windowTarget, styleStore);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = hasHardFailures(summary) ? 1 : 0;
}

runHarness().catch((error) => {
  process.stderr.write(
    `[plugin-harmony-harness] fatal: ${error?.stack || error}\n`
  );
  process.exitCode = 1;
});
