// PluginGuardian — auto-enable enforcement (event-driven).
//
// THE ORIGINAL BUG: BetterDiscord's plugin file watcher has two paths. The
// `change` event path is safe (preserves enabled state). The `rename` event
// path calls `loadAddon` directly without first unloading; `requireAddon`
// then throws "alreadyExists" because the plugin is still in addonList; the
// catch block silently sets `state[id] = false`. macOS fs.watch fires
// `rename` events for many file operations, so any rebuild can silently
// disable a plugin — no console error, no user notification.
//
// CURRENT BEHAVIOUR:
//   1. On Discord launch, snapshot every installed plugin EXCEPT the user-
//      controlled denylist (default: ["CSS Picker"]) and run one reconcile
//      pass to enable any disabled members.
//   2. Watch the BetterDiscord plugins folder via fs.watch — any `.plugin.js`
//      rename/change schedules a debounced reconcile ~1s later, after BD's
//      race has had time to fire the silent-disable bug. No background poll.
//   3. Manual "Re-check now" button in settings as a safety net.
//
// USER INTENT: "I want all my plugins active out of the box on every launch
// without having to click toggles, and I don't want a 500ms heartbeat
// running while I'm just chatting."

const fs = require("fs");
const path = require("path");

const SELF_ID = "PluginGuardian";
const DEFAULT_DENYLIST = ["CSS Picker"];
const DATA_NAMESPACE = "PluginGuardian";
const DATA_KEY = "denylist";
const REBUILD_DEBOUNCE_MS = 1000; // wait for BD's race to settle before reconciling

module.exports = class PluginGuardian {
  constructor() {
    this._denylist = new Set();
    this._snapshot = new Set();
    this._fsWatcher = null;
    this._debounceTimer = null;
  }

  start() {
    this._loadDenylist();
    this._snapshotEnabled();
    this._reconcile(); // immediate first pass on launch
    this._attachRebuildWatcher();

    if (BdApi.UI && typeof BdApi.UI.showToast === "function") {
      const watchCount = this._snapshot.size;
      const denyCount = this._denylist.size;
      BdApi.UI.showToast(
        `PluginGuardian: ${watchCount} auto-enabled` +
          (denyCount ? ` · ${denyCount} skipped` : ""),
        { type: "success", timeout: 2500 }
      );
    }
  }

  stop() {
    this._detachRebuildWatcher();
    this._snapshot.clear();
  }

  // ─── Settings panel ─────────────────────────────────────────────────────

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.padding = "16px";
    panel.style.color = "#dcddde";
    panel.style.fontFamily = "Whitney, sans-serif";
    panel.style.background = "#1e1e2e";

    const title = document.createElement("h3");
    title.style.margin = "0 0 12px 0";
    title.style.color = "#fff";
    title.textContent = "PluginGuardian";
    panel.appendChild(title);

    const explainer = document.createElement("p");
    explainer.style.margin = "0 0 12px 0";
    explainer.style.lineHeight = "1.5";
    explainer.style.color = "#a0a0b0";
    explainer.style.fontSize = "12px";
    explainer.textContent =
      "Plugins are auto-enabled on Discord launch and re-enabled when a rebuild trips BD's silent-disable race. " +
      "Tick a checkbox to denylist (leave a plugin alone). Default denylist: CSS Picker.";
    panel.appendChild(explainer);

    const status = document.createElement("p");
    status.style.margin = "0 0 12px 0";
    status.style.lineHeight = "1.5";
    status.style.color = "#a0a0b0";
    status.style.fontSize = "12px";
    const renderStatus = () => {
      status.textContent = `Enforcing ${this._snapshot.size} plugin${this._snapshot.size === 1 ? "" : "s"} · ${this._denylist.size} denylisted.`;
    };
    renderStatus();
    panel.appendChild(status);

    const recheckBtn = document.createElement("button");
    recheckBtn.style.padding = "7px 14px";
    recheckBtn.style.marginBottom = "12px";
    recheckBtn.style.background = "#5865f2";
    recheckBtn.style.color = "#fff";
    recheckBtn.style.border = "0";
    recheckBtn.style.borderRadius = "4px";
    recheckBtn.style.cursor = "pointer";
    recheckBtn.style.fontSize = "12px";
    recheckBtn.style.fontWeight = "600";
    recheckBtn.textContent = "Re-check now";
    recheckBtn.addEventListener("click", () => {
      this._snapshotEnabled();
      this._reconcile();
      renderStatus();
      if (BdApi.UI?.showToast) {
        BdApi.UI.showToast("PluginGuardian re-checked", { type: "info", timeout: 1500 });
      }
    });
    panel.appendChild(recheckBtn);

    // Checkbox list — one row per installed plugin (excluding self).
    const all = BdApi.Plugins.getAll() || [];
    const list = document.createElement("div");
    list.style.maxHeight = "320px";
    list.style.overflowY = "auto";
    list.style.padding = "8px 12px";
    list.style.background = "rgba(0,0,0,0.25)";
    list.style.border = "1px solid rgba(255,255,255,0.08)";
    list.style.borderRadius = "4px";

    const sortedIds = all
      .map((p) => p.id || p.name)
      .filter((id) => id && id !== SELF_ID)
      .sort((a, b) => a.localeCompare(b));

    for (const id of sortedIds) {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "10px";
      row.style.padding = "5px 2px";
      row.style.cursor = "pointer";
      row.style.fontSize = "13px";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = this._denylist.has(id);

      const name = document.createElement("span");
      name.textContent = id;
      name.style.color = cb.checked ? "#a0a0b0" : "#dcddde";

      const tag = document.createElement("span");
      tag.style.marginLeft = "auto";
      tag.style.fontSize = "11px";
      tag.style.color = cb.checked ? "#f87171" : "#9b32ff";
      tag.textContent = cb.checked ? "denylisted" : "auto-enabled";

      cb.addEventListener("change", () => {
        if (cb.checked) {
          this._denylist.add(id);
          // Denylisting → user wants this OFF now too.
          try { BdApi.Plugins.disable(id); } catch (_) {}
        } else {
          this._denylist.delete(id);
        }
        this._saveDenylist();
        this._snapshotEnabled();
        this._reconcile();
        name.style.color = cb.checked ? "#a0a0b0" : "#dcddde";
        tag.style.color = cb.checked ? "#f87171" : "#9b32ff";
        tag.textContent = cb.checked ? "denylisted" : "auto-enabled";
        renderStatus();
      });

      row.appendChild(cb);
      row.appendChild(name);
      row.appendChild(tag);
      list.appendChild(row);
    }
    panel.appendChild(list);

    return panel;
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  _loadDenylist() {
    let saved = null;
    try { saved = BdApi.Data.load(DATA_NAMESPACE, DATA_KEY); } catch (_) {}
    if (Array.isArray(saved)) {
      this._denylist = new Set(saved.filter((x) => typeof x === "string" && x.length > 0));
    } else {
      this._denylist = new Set(DEFAULT_DENYLIST);
      this._saveDenylist();
    }
  }

  _saveDenylist() {
    try {
      BdApi.Data.save(DATA_NAMESPACE, DATA_KEY, Array.from(this._denylist));
    } catch (_) {}
  }

  _snapshotEnabled() {
    this._snapshot.clear();
    const all = BdApi.Plugins.getAll() || [];
    for (const plugin of all) {
      const id = plugin.id || plugin.name;
      if (!id || id === SELF_ID || this._denylist.has(id)) continue;
      this._snapshot.add(id);
    }
  }

  // Resolve BD's plugins folder by inspecting any loaded plugin's file path.
  // BdApi doesn't expose `folder` directly, but every Addon entry has a
  // `.filename` (absolute path to its .plugin.js). Their dirname is the
  // plugins folder.
  _resolvePluginsFolder() {
    const all = BdApi.Plugins.getAll() || [];
    for (const plugin of all) {
      const filename = plugin.filename || plugin.path;
      if (typeof filename === "string" && filename.endsWith(".plugin.js")) {
        return path.dirname(filename);
      }
    }
    return null;
  }

  _attachRebuildWatcher() {
    const folder = this._resolvePluginsFolder();
    if (!folder) {
      console.warn("[PluginGuardian] Could not resolve plugins folder — rebuild auto-detect disabled.");
      return;
    }
    try {
      this._fsWatcher = fs.watch(folder, { persistent: false }, (eventType, filename) => {
        if (!filename || !String(filename).endsWith(".plugin.js")) return;
        // Debounce — multiple fs events fire per single rebuild (write,
        // rename, change). Coalesce them into one reconcile.
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
          this._debounceTimer = null;
          // Refresh the snapshot in case a NEW plugin file was added.
          this._snapshotEnabled();
          this._reconcile();
        }, REBUILD_DEBOUNCE_MS);
      });
    } catch (err) {
      console.error("[PluginGuardian] fs.watch failed:", err);
      this._fsWatcher = null;
    }
  }

  _detachRebuildWatcher() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._fsWatcher) {
      try { this._fsWatcher.close(); } catch (_) {}
      this._fsWatcher = null;
    }
  }

  _reconcile() {
    for (const id of this._snapshot) {
      if (id === SELF_ID) continue;
      try {
        if (!BdApi.Plugins.isEnabled(id)) {
          BdApi.Plugins.enable(id);
          console.log(`[PluginGuardian] Auto-enabled "${id}"`);
        }
      } catch (err) {
        console.error(`[PluginGuardian] Failed to enable "${id}":`, err);
      }
    }
  }
};
